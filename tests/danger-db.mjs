#!/usr/bin/env node
// tests/danger-db.mjs — THE DANGER SCALE IS THE SERVER'S (1056-danger-scale.sql, lane/v1-climb wave 1; CLAUDE.md §1, §4 both paths).
//
//   node tests/danger-db.mjs            the guard
//   node tests/danger-db.mjs --mutate   the proof: each SQL mutant turns it red
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick and the viewed hello (tools/settle-cost.mjs), the real engine.
//   DZ-1 BOTH PATHS: a Level 60 four on Muster Barrows whose leader's plan names Steady, each of whom last held step 20 there (it opens
//        at the ground as built and climbs): browser closed (the tick's `fire` door) and hunt viewed (index.ts's hello, the `viewed` door) from
//        one anchor. The instance froze steady at 20 - start_margin (0),
//        every window landed (no refusal), the stored world plays the scale (a stance, a step it climbed to), the two doors store the same world and pay the
//        same Level XP, and every kill paid the scale's share of the hero's own Level (src/core/hunt/danger.js levelShareXp) at a step the
//        window could stand at, never its row's XP.
//   DZ-2 THE SECTION: a reload's `danger` section names the frozen stance, the start and the stored world's step (the server's numbers).
//   DZ-3 THE END: the session ends with the world's stance and step stamped on its row, and the hero's held step on the ground is that step.
//   DZ-4 A FOUR: the leader's stance is the party's, and the party opens a margin under its LOWEST held step (a weaker hero sets the start).
//   DZ-5 THE DEFAULT (1057-danger-falls.sql, the Coordinator's R2 add-on; 02 package 8): the same hero whose plan names NO stance, and sends no
//        verb, plays the catalogue's default (src/data/danger.js DEFAULT_RISK, Steady) on Muster, browser closed and hunt viewed: the
//        instance froze it, every window landed, and the two doors store the same world on the scale. (A ground off the scale freezes nothing:
//        1057's §7 f, and 1056's §6 i.)
//   DZ-6 THE FALLS, BOTH PATHS (R2, 1057-danger-falls.sql): a four with no stance that last held step 760 (far past its edge) opens at 740, played
//        at Muster's band top 710 (lane/r10: no step past the top), and
//        falls back. Browser closed in 90 s windows and hunt viewed in 45 s windows, to the same instant: every seat's session stores the SAME
//        report `falls` and `deep` on both doors (the engine names each fall's hero by seat and its monster; the server folds them), byte for
//        byte; there are falls (control), at most report_falls_max of them, each a seat of the four and a monster of the ground, the deepest
//        step the start; and the `hunt` section names each fall's hero by the character that held the seat.
//        THE LEDGER (19-power-ledger L7, folded into 1057 while staged): the same doors store the same `heal` (the company's healing by
//        source), `took` (its damage taken by seat) and `sup` (each hero's store bill and time by step bucket), byte for byte; the first two
//        alike on every seat, every seat's time adds to the hours hunted, and the `hunt` section names each seat that took damage.
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { decodeStored } from '../src/core/hunt/world-state.js';
import { DANGER, CLIMB, DEFAULT_RISK, DANGER_GROUNDS } from '../src/data/danger.js';
import { HUNT_REPORT } from '../src/data/hunt-report.js';
import { levelShareXp } from '../src/core/hunt/danger.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';

const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const WINDOWS = 3;
const MUSTER = 'muster_barrows';
/* the step the hero last held there: shallow enough that a Level 60 climbs inside the guard's windows (the section and the climb bound read a moved step) */
const HELD = 20;
/* Item Level 30 steel under Muster's gearLevel 60 (src/data/danger.js): the power step (lane/r9, the gear table's gear part) is live, well
   under the ground (half its slots empty), so DZ-1 to DZ-5's both-path checks hold with it in play. */
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
/* (lane/r9) A STRONGER KIT for DZ-6: every weapon and armor piece item Level 60 (no jewelry, so a gear part near 40). In steel,
   at 740 (far past its edge) died in its first pull before it could fall back, and the falls are what DZ-6 reads. */
const REF_KIT = Object.freeze({ helmet: 'rune_helm', body: 'rune_platebody', pants: 'rune_platelegs', boots: 'rune_boots', gloves: 'rune_gauntlets', belt: 'rune_belt',
  weapon: 'rune_sword', shield: 'coppercap_shield' });
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };

/* The plan and the held steps, through the real verb, inside prepare's fixture transaction. */
const planWith = (risk, held) => async ({ db, uids, asUser, one: q, idem: id }) => {
  for (const [i, uid] of uids.entries()) {
    if (held[i] !== undefined) {
      await db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 0, $3) on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held', [uid, MUSTER, held[i]]);
    }
  }
  if (risk) {
    await asUser(uids[0]);
    const r = await q(db, 'select public.hr_hunt_risk_set(0, $1, $2::uuid)', [risk, id()]);
    if (!r || r.ok !== true) throw new Error('the stance was refused: ' + JSON.stringify(r).slice(0, 200));
  }
};

async function door(db, which, o = {}) {
  const windows = o.windows || WINDOWS;
  const run = await prepare({ heroes: o.heroes || 1, windows, ...(o.windowMs ? { windowMs: o.windowMs } : {}), hunt: MUSTER, door: which, db, level: 60, anchorMs: ANCHOR, gear: o.gear || GEAR,
    beforeEnter: planWith(o.risk === undefined ? 'steady' : o.risk, o.held || [HELD]) });
  await run.warm();
  for (let w = 2; w <= windows + 1; w++) await run.step(w);
  const row = (await db.query(`select i.id, i.risk, i.danger, i.danger_top, i.refusals, i.world::text as world, s.user_id, s.id as sid
      from public.hunt_instances i join public.hunt_sessions s on s.instance_id = i.id where i.hunt_id = $1 order by s.entered_at, s.user_id limit 1`, [MUSTER])).rows[0];
  const xp = Number(await one(db, 'select level_xp - public.hr_char_xp_for_level(60) from public.player_state where user_id = $1 and slot = 0', [row.user_id]));
  const kills = Number(await one(db, `select coalesce(sum((l.meta->>'kills')::numeric), 0) from public.player_ledger l join public.hunt_sessions s on s.id = l.session_id
      where s.user_id = $1 and jsonb_typeof(l.meta->'kills') = 'number'`, [row.user_id]));
  const rowXpMax = Number(await one(db, `select max(b.xp_max) from public.hr_hunt_kill_bounds b join public.hr_hunt_ground_spawns sp on sp.monster_id = b.monster_id where sp.hunt_id = $1`, [MUSTER]));
  const headroom = Number(await one(db, `select public.hr_hunt_limit('value_headroom')`));
  return { ...row, xp, kills, rowXpMax, headroom, db };
}

async function bothPaths(boot) {
  const problems = [];
  const closed = await door((await boot()).db, 'fire', { heroes: 4, held: [HELD, HELD, HELD, HELD] });
  const viewed = await door((await boot()).db, 'viewed', { heroes: 4, held: [HELD, HELD, HELD, HELD] });
  const start = HELD - DANGER.startMargin;
  for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed]]) {
    if (r.risk !== 'steady' || r.danger !== start) problems.push('DZ-1 ' + name + ': the instance froze ' + r.risk + ' at ' + r.danger + ', want steady at ' + start);
    if (Number(r.refusals) !== 0) problems.push('DZ-1 ' + name + ': ' + r.refusals + ' window(s) refused');
    const w = r.world ? decodeStored(JSON.parse(r.world)) : null;
    if (!w || !['steady', 'careful'].includes(w.risk) || !(Number.isInteger(w.danger) && w.danger > start)) problems.push('DZ-1 ' + name + ': the stored world plays ' + JSON.stringify(w && { risk: w.risk, danger: w.danger }) + ', not the scale');
    if (!(r.xp > 0)) problems.push('DZ-1 ' + name + ': no Level XP was paid');
    /* a kill pays each hero its share over the heroes there (one to four), at a step between the deepest fall and the most it can climb */
    const g = HUNT_GROUNDS[MUSTER], lo = Math.floor(levelShareXp(60, Math.max(0, start - CLIMB.deathSteps - CLIMB.fallSteps), g) / 4);
    const hi = Math.ceil(levelShareXp(60, start + CLIMB.climbMax * r.kills, g));
    if (!(r.kills > 0) || r.xp < r.kills * lo || r.xp > r.kills * hi) problems.push('DZ-1 ' + name + ': ' + r.xp + ' Level XP over ' + r.kills + ' kills, not the scale\'s share of Level 60 a kill over one to four heroes (' + lo + '..' + hi + ')');
  }
  if (closed.world !== viewed.world) problems.push('DZ-1 the two doors stored different worlds');
  if (closed.xp !== viewed.xp) problems.push('DZ-1 browser closed pays ' + closed.xp + ' Level XP, hunt viewed ' + viewed.xp);
  /* DZ-2 the section, on the viewed door's db (its hunt still open) */
  const sec = (await one(viewed.db, 'select public.hr_state_of($1::uuid, 0)', [viewed.user_id])).danger;
  const w = decodeStored(JSON.parse(viewed.world));
  if (!sec || sec.risk !== 'steady' || !sec.playing || sec.playing.from !== 'steady' || sec.playing.start !== start || sec.playing.step !== w.danger || sec.playing.risk !== w.risk) {
    problems.push('DZ-2 a reload reads ' + JSON.stringify(sec) + ', the world stands at ' + w.risk + ' ' + w.danger);
  }
  /* DZ-3 the end */
  await viewed.db.query("select public.hr_hunt_close($1, 'left', now(), true)", [viewed.sid]);
  const end = (await viewed.db.query('select s.risk_end, s.danger_end, d.danger_held from public.hunt_sessions s left join public.hunt_density d on d.user_id = s.user_id and d.slot = s.slot and d.hunt_id = s.hunt_id where s.id = $1', [viewed.sid])).rows[0];
  if (!end || end.risk_end !== w.risk || end.danger_end !== w.danger || end.danger_held !== w.danger) problems.push('DZ-3 the end stamped ' + JSON.stringify(end) + ', the world stood at ' + w.risk + ' ' + w.danger);
  return problems;
}

async function aFour(boot) {
  const r = await door((await boot()).db, 'fire', { heroes: 4, held: [400, 300, 500, 450] });
  const problems = [];
  if (r.risk !== 'steady' || r.danger !== 300 - DANGER.startMargin) problems.push('DZ-4 the four froze ' + r.risk + ' at ' + r.danger + ', want steady at ' + (300 - DANGER.startMargin) + ' (its lowest held step less the margin)');
  if (Number(r.refusals) !== 0) problems.push('DZ-4 ' + r.refusals + ' window(s) refused');
  return problems;
}

async function byDefault(boot) {
  const problems = [];
  const closed = await door((await boot()).db, 'fire', { risk: null });
  const viewed = await door((await boot()).db, 'viewed', { risk: null });
  for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed]]) {
    const w = r.world ? decodeStored(JSON.parse(r.world)) : null;
    if (r.risk !== DEFAULT_RISK || r.danger !== HELD - DANGER.startMargin) problems.push('DZ-5 ' + name + ': a plan with no stance froze ' + r.risk + ' at ' + r.danger + ', not the default ' + DEFAULT_RISK + ' at ' + (HELD - DANGER.startMargin));
    if (Number(r.refusals) !== 0) problems.push('DZ-5 ' + name + ': ' + r.refusals + ' window(s) refused');
    if (!w || !w.risk) problems.push('DZ-5 ' + name + ': the stored world plays ' + JSON.stringify(w && w.risk) + ', not the scale');
  }
  if (closed.world !== viewed.world) problems.push('DZ-5 the two doors stored different worlds');
  return problems;
}

/* DZ-6: each seat's stored report, its `falls` and `deep` and the ledger's `heal`, `took`, `sup`, on one door */
async function fallsOf(db) {
  return (await db.query(`select s.seat, s.id, t.report->'falls' as falls, t.report->'deep' as deep, t.report->'heal' as heal,
      t.report->'took' as took, t.report->'sup' as sup from public.hunt_sessions s
      join public.hunt_session_tally t on t.session_id = s.id where s.hunt_id = $1 order by s.seat`, [MUSTER])).rows;
}
async function fallsBothPaths(boot) {
  const problems = [];
  const DEEP = 760, START = DEEP - DANGER.startMargin;
  /* (lane/r10) a start held past the band's top plays AT the top (src/core/hunt/danger.js stepOn): the deepest step the four stood at */
  const PLAYED = Math.min(START, DANGER_GROUNDS[MUSTER].topStep);
  const closed = await door((await boot()).db, 'fire', { heroes: 4, risk: null, held: [DEEP, DEEP, DEEP, DEEP], gear: REF_KIT, windows: 3, windowMs: 90000 });
  const viewed = await door((await boot()).db, 'viewed', { heroes: 4, risk: null, held: [DEEP, DEEP, DEEP, DEEP], gear: REF_KIT, windows: 7, windowMs: 45000 });
  for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed]]) if (Number(r.refusals) !== 0) problems.push('DZ-6 ' + name + ': ' + r.refusals + ' window(s) refused');
  const a = await fallsOf(closed.db), b = await fallsOf(viewed.db);
  const canon = (rows) => JSON.stringify(rows.map((x) => [x.seat, x.falls, x.deep, x.heal, x.took, x.sup]));
  if (canon(a) !== canon(b)) problems.push('DZ-6 the browser closed stored ' + canon(a).slice(0, 300) + '\n      the hunt viewed ' + canon(b).slice(0, 300));
  const monsters = new Set((await closed.db.query('select monster_id from public.hr_hunt_ground_spawns where hunt_id = $1', [MUSTER])).rows.map((x) => x.monster_id));
  if (a.length !== 4) problems.push('DZ-6 CONTROL: ' + a.length + ' seats hold a report');
  for (const x of a) {
    const falls = Array.isArray(x.falls) ? x.falls : [];
    if (!falls.length) { problems.push('DZ-6 CONTROL: seat ' + x.seat + ' stored no fall back from step ' + START); continue; }
    if (falls.length > HUNT_REPORT.fallsMax) problems.push('DZ-6 seat ' + x.seat + ' stored ' + falls.length + ' falls, past ' + HUNT_REPORT.fallsMax);
    if (x.deep !== PLAYED) problems.push('DZ-6 seat ' + x.seat + '\'s deepest step reads ' + x.deep + ', the start played at ' + PLAYED + ' (held ' + START + ')');
    for (const f of falls) {
      if (!(Number.isInteger(f.hero) && f.hero >= 0 && f.hero < 4) || !monsters.has(f.monster) || !(f.to < f.from) || !(f.pm < 1000)) problems.push('DZ-6 seat ' + x.seat + ' stored a fall ' + JSON.stringify(f));
    }
    if (canon([{ ...x, seat: 0, sup: null }]) !== canon([{ ...a[0], seat: 0, sup: null }])) problems.push('DZ-6 seat ' + x.seat + ' holds other falls or another ledger than seat 0: every hero carries the company\'s');
    /* THE LEDGER: healing and damage taken counted, the seats the four's, the time by step adding to the windows played */
    const heal = x.heal || {}, took = x.took || {}, sup = x.sup || {};
    if (!Object.keys(heal).length || !Object.values(heal).every((n) => Number.isInteger(n) && n > 0)) problems.push('DZ-6 seat ' + x.seat + ' stored no healing by source: ' + JSON.stringify(x.heal));
    if (!Object.keys(took).length || Object.keys(took).some((k) => !/^[0-3]$/.test(k))) problems.push('DZ-6 seat ' + x.seat + ' stored damage taken by ' + JSON.stringify(x.took));
    const ms = Object.values(sup).reduce((t, v) => t + (Array.isArray(v) ? v[1] : 0), 0);
    if (!(ms > 0) || Object.keys(sup).some((k) => Number(k) % HUNT_REPORT.supStep !== 0 || Number(k) > START)) problems.push('DZ-6 seat ' + x.seat + ' stored supplies by step ' + JSON.stringify(x.sup));
  }
  const seats = await one(closed.db, `select public.hr_hunt_view($1::uuid)->'tally'->'report'->'seats'`, [a[0].id]);
  const named = new Map((await closed.db.query('select seat, public.hr_character_name(user_id, slot) as name from public.hunt_sessions where hunt_id = $1', [MUSTER])).rows.map((x) => [String(x.seat), x.name]));
  if (!seats || !Object.keys(a[0].took || {}).every((k) => seats[k] && seats[k] === named.get(k))) problems.push('DZ-6 the hunt section names the seats ' + JSON.stringify(seats) + ', the seats ' + JSON.stringify([...named]));
  /* the `hunt` section names each fall's hero: the character that held the seat */
  const v = await one(closed.db, `select public.hr_hunt_view($1::uuid)->'tally'->'report'->'falls'`, [a[0].id]);
  const names = new Map((await closed.db.query('select seat, public.hr_character_name(user_id, slot) as name from public.hunt_sessions where hunt_id = $1', [MUSTER])).rows.map((x) => [x.seat, x.name]));
  if (!Array.isArray(v) || !v.length || v.some((f) => !f.name || f.name !== names.get(f.hero))) problems.push('DZ-6 the hunt section names ' + JSON.stringify((v || []).map((f) => [f.hero, f.name])) + ', the seats ' + JSON.stringify([...names]));
  return problems;
}

/* SQL mutants, patched into the booted replay: the body as it landed, one change. */
const MUTANTS = [
  { name: 'the freeze ignores the margin', fn: 'public.hr_danger_freeze()', find: "- coalesce(v_margin, 0)", repl: '- 0', want: /^DZ-1 .*froze/ },
  { name: 'the engine never reads the frozen stance', fn: 'public.hr_hunt_instance_read(uuid,integer)', find: "jsonb_build_object('risk', v_i.risk, 'danger', v_i.danger)", repl: "jsonb_build_object('risk', null, 'danger', null)", want: /^DZ-1 .*(not the scale|refused|THREW)/ },
  { name: 'the climb bound admits no honest climb', fn: 'public.hr_danger_bound(uuid,uuid,integer,bigint)', find: 'if v_step > v_top + v_climb then', repl: 'if v_step > v_top then', want: /^(DZ-1 .*refused|THREW)/ },
  { name: 'the end never stamps the held step', fn: 'public.hr_danger_end_stamp()', find: 'on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held;', repl: 'on conflict (user_id, slot, hunt_id) do nothing;', want: /^DZ-3/ },
  { name: 'the section reads the plan for the hunt', fn: 'public.hr_danger_view(uuid,integer)', find: "'step', coalesce(case when jsonb_typeof(v_w->'step') = 'number' then (v_w->>'step')::int end, v_i.danger),", repl: "'step', v_i.danger,", want: /^DZ-2/ },
  { name: 'a party starts at its leader\'s held step', fn: 'public.hr_danger_freeze()', find: 'select m.user_id, m.slot from public.hunt_party_members m where m.party_id = new.instance_id\n          union ', repl: '', want: /^DZ-4/, four: true },
  { name: 'a plan with no stance plays the tier on a scale ground', fn: 'public.hr_danger_freeze()', find: '    select r.default_risk into v_risk from public.hr_danger_rules r where r.id;\n', repl: '', want: /^DZ-5/, off: true },
  /* R2: the falls (1057-danger-falls.sql) */
  { name: 'the fold keeps the stored falls only', fn: 'public.hr_hunt_report_add(jsonb,jsonb)', find: "then b->'falls' else '[]'::jsonb end)) u", repl: "then '[]'::jsonb else '[]'::jsonb end)) u", want: /^DZ-6/, falls: true },
  { name: 'the fold keeps every fall', fn: 'public.hr_hunt_report_add(jsonb,jsonb)', find: 'order by d.at desc limit v_max) k;', repl: 'order by d.at desc) k;', want: /^DZ-6/, falls: true },
  { name: 'the shape refuses every fall', fn: 'public.hr_hunt_report_ok(jsonb)', find: "        if jsonb_typeof(v_v) <> 'array' then return false; end if;\n        if jsonb_array_length(v_v) < 1", repl: "        return false;\n        if jsonb_array_length(v_v) < 1", want: /^(DZ-6|THREW)/, falls: true },
  /* THE LEDGER (19-power-ledger L7) */
  { name: 'the fold forgets the supplies', fn: 'public.hr_hunt_report_add(jsonb,jsonb)', find: "'heal', v_heal, 'took', v_took, 'sup', v_sup));", repl: "'heal', v_heal, 'took', v_took));", want: /^DZ-6/, falls: true },
  { name: 'the section names no seat', fn: 'public.hr_hunt_view(uuid)', find: "jsonb_build_object('seats', (", repl: "jsonb_build_object('seatz', (", want: /^DZ-6/, falls: true },
  { name: 'the shape refuses the healing', fn: 'public.hr_hunt_report_ok(jsonb)', find: "      when 'heal', 'took' then", repl: "      when 'heal', 'took' then\n        return false;", want: /^(DZ-6|THREW)/, falls: true },
  { name: 'the section names nobody', fn: 'public.hr_hunt_view(uuid)', find: 'select public.hr_character_name(o.user_id, o.slot) from public.hunt_sessions o\n                                           where o.instance_id = s.instance_id and o.seat', repl: 'select null::text from public.hunt_sessions o\n                                           where o.instance_id = s.instance_id and o.seat', want: /^DZ-6/, falls: true },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      const boot = async () => {
        const b = await bootReplay();
        const def = await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
        if (!def.replace(/\r/g, '').includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
        await b.db.exec(def.replace(/\r/g, '').replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = m.four ? await aFour(boot) : m.off ? await byDefault(boot) : m.falls ? await fallsBothPaths(boot) : await bothPaths(boot); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      if (got.some((p) => /HARNESS/.test(p))) { console.log('  HARNESS ' + m.name + ': ' + got[0]); process.exitCode = 2; return; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'danger-db --mutate: ' + escaped + ' ESCAPED' : 'danger-db --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  const problems = [...await bothPaths(boot), ...await aFour(boot), ...await byDefault(boot), ...await fallsBothPaths(boot)];
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'danger-db: ' + problems.length + ' FAILED' : 'danger-db: green (both paths, the section, the end stamp, a four from its lowest held step, the default stance, the falls both paths)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
