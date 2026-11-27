#!/usr/bin/env node
// tests/personal-loot-db.mjs — PERSONAL LOOT IS THE SERVER'S: THE FROZEN RULE, EACH SEAT'S OWN BAG, BOTH PATHS (1076-personal-loot.sql,
// lane/p1-personal-loot, backend-architect, 2026-11-27; 20-v030-the-roads.md section 4 P1 "a viewed and a closed four store the same loot per
// seat", 21-flame-temper-imbue-loot.md section 4, CLAUDE.md §1, §4 both paths, §6). The engine's half is tests/personal-loot-play.mjs.
//
//   node tests/personal-loot-db.mjs            the guard
//   node tests/personal-loot-db.mjs --mutate   the proof: each planted SQL or edge defect turns its case red
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick (browser closed, the `fire` door) and the viewed hello (hunt viewed,
// the `viewed` door) through tools/settle-cost.mjs, the real engine: a Level 60 four of steel from four accounts on Muster Barrows on Steady.
//   PLD-1 DARK AND FROZEN: with the switch as applied (off) the instance freezes personal_loot false and the read hands false; lighting the
//         switch mid-hunt, or an UPDATE that names the column, moves no running instance's rule (the read still hands false).
//   PLD-2 BOTH PATHS: with the switch lit before the four enters, the closed and the viewed hunt from one anchor store the SAME bag for every
//         seat (player_inventory) and journal the same items on each seat's own ledger rows; at least two seats found loot; the read hands
//         true; and the bags differ from the same four dark (the rule moved the loot: each hero rolled its own).
//   PLD-3 PER SEAT, THROUGH THE REAL COMMIT: on a lit hunt, a proposal with one seat's find inflated past that seat's own bound refuses the
//         whole settle value_over and lands nothing; the untampered proposal then lands.
//
// mutant-anchors: supabase/migrations/1076-personal-loot.sql supabase/functions/hr-accrue/hunt-settle.js
// ci-step: db-replay | Personal loot - the instance's frozen rule, each seat's own bag both paths, the per-seat bound through the real commit (1076)
// ci-run: node tests/personal-loot-db.mjs
// ci-run: node tools/mutant-gate.mjs node tests/personal-loot-db.mjs --mutate
import { isMain } from './_is-main.mjs';
import { bootReplay, closeReplays } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { plant } from './hunt-core/fixtures/h1.js';

const MUSTER = 'muster_barrows';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const HELD = 20;
const WINDOWS = 4;
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
const START = Object.freeze({ cooked_shrimp: true });
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const exec = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

/* the held step and the stance (danger-db's planWith), and the switch as the four enters */
const fixture = ({ lit }) => async ({ db, uids, asUser, one: q, idem: id }) => {
  for (const uid of uids) {
    await db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 0, $3) on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held', [uid, MUSTER, HELD]);
  }
  await asUser(uids[0]);
  const r = await q(db, 'select public.hr_hunt_risk_set(0, $1, $2::uuid)', ['steady', id()]);
  if (!r || r.ok !== true) throw new Error('the stance was refused: ' + JSON.stringify(r).slice(0, 200));
  await db.query("update public.hr_flags set enabled = $1 where key = 'personal_loot'", [lit === true]);
};

const EVIDENCE = [];
async function door(db, which, o = {}) {
  const run = await prepare({ heroes: 4, windows: WINDOWS, hunt: MUSTER, door: which, db, level: 60, anchorMs: ANCHOR, gear: GEAR,
    edgeRoot: o.edgeRoot, beforeEnter: fixture(o) });
  await run.warm();
  for (let w = 2; w <= WINDOWS + 1; w++) await run.step(w);
  const inst = (await db.query('select id, refusals, personal_loot, world::text as world from public.hunt_instances where hunt_id = $1', [MUSTER])).rows[0];
  return { run, db, inst, users: run.users };
}

/* each seat's bag, the start kit left out: [[seat, [[item, qty], ...]], ...] in seat order */
const bagsOf = async (db) => {
  const rows = (await db.query(`select s.seat, i.item_id, i.qty::text as qty from public.player_inventory i
      join public.hunt_sessions s on s.user_id = i.user_id and s.slot = i.slot and s.hunt_id = $1 order by s.seat, i.item_id`, [MUSTER])).rows;
  const out = new Map();
  for (const r of rows) { if (START[r.item_id]) continue; if (!out.has(r.seat)) out.set(r.seat, []); out.get(r.seat).push([r.item_id, Number(r.qty)]); }
  return JSON.stringify([...out.entries()]);
};
/* each seat's journalled hunt items, summed over its own ledger rows */
const journalOf = async (db) => JSON.stringify((await db.query(`select s.seat, x.key as item, sum((x.value #>> '{}')::numeric)::text as qty
    from public.player_ledger l join public.hunt_sessions s on s.id = l.session_id and s.hunt_id = $1
    cross join lateral jsonb_each(case when jsonb_typeof(l.meta->'items') = 'object' then l.meta->'items' else '{}'::jsonb end) x
   where jsonb_typeof(x.value) = 'number'
   group by s.seat, x.key order by s.seat, x.key`, [MUSTER])).rows.map((r) => [r.seat, r.item, r.qty]));

async function frozen(boot) {
  const problems = [];
  const r = await door((await boot()).db, 'fire', { lit: false });
  if (Number(r.inst.refusals) !== 0) problems.push('PLD-1 ' + r.inst.refusals + ' window(s) refused');
  const read = await one(r.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [r.users[0]]);
  if (!read || read.open !== true) return [...problems, 'PLD-1 CONTROL: the hunt is not open (' + JSON.stringify(read).slice(0, 120) + ')'];
  if (r.inst.personal_loot !== false || read.instance.personal_loot !== false) problems.push('PLD-1 a dark hunt froze ' + r.inst.personal_loot + ' and the read hands ' + JSON.stringify(read.instance.personal_loot));
  await r.db.query("update public.hr_flags set enabled = true where key = 'personal_loot'");
  const lit = await one(r.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [r.users[0]]);
  if (lit.instance.personal_loot !== false) problems.push('PLD-1 lighting the switch mid-hunt moved the running instance\'s rule (the read hands ' + JSON.stringify(lit.instance.personal_loot) + ')');
  await r.db.query('update public.hunt_instances set personal_loot = true where id = $1', [r.inst.id]);
  const forced = await one(r.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [r.users[0]]);
  if (forced.instance.personal_loot !== false) problems.push('PLD-1 an UPDATE naming the column set the frozen rule (the read hands ' + JSON.stringify(forced.instance.personal_loot) + ')');
  EVIDENCE.push('PLD-1 dark: frozen ' + r.inst.personal_loot + ', read ' + read.instance.personal_loot + ', after a mid-hunt light ' + lit.instance.personal_loot + ', after a forced UPDATE ' + forced.instance.personal_loot);
  return problems;
}

async function bothPaths(boot, o = {}) {
  const problems = [];
  const edge = o.edits && o.edits.length ? plant(o.edits, ['supabase/functions/hr-accrue']) : null;
  try {
    const closed = await door((await boot()).db, 'fire', { lit: true, edgeRoot: edge && edge.root });
    const viewed = await door((await boot()).db, 'viewed', { lit: true, edgeRoot: edge && edge.root });
    const dark = await door((await boot()).db, 'fire', { lit: false, edgeRoot: edge && edge.root });
    for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed], ['dark', dark]]) if (Number(r.inst.refusals) !== 0) problems.push('PLD-2 ' + name + ': ' + r.inst.refusals + ' window(s) refused');
    const a = await bagsOf(closed.db), b = await bagsOf(viewed.db), d = await bagsOf(dark.db);
    const seats = JSON.parse(a).filter(([, items]) => items.length).length;
    EVIDENCE.push('PLD-2 lit bags by seat ' + a.slice(0, 260) + (a === b ? ' (both doors identical)' : ' (doors DIFFER)'));
    EVIDENCE.push('PLD-2 dark bags by seat ' + d.slice(0, 260));
    if (a !== b) problems.push('PLD-2 the doors stored different bags:\n      closed ' + a.slice(0, 400) + '\n      viewed ' + b.slice(0, 400));
    const ja = await journalOf(closed.db), jb = await journalOf(viewed.db);
    if (ja !== jb) problems.push('PLD-2 the doors journalled different items a seat:\n      closed ' + ja.slice(0, 300) + '\n      viewed ' + jb.slice(0, 300));
    if (ja === '[]') problems.push('PLD-2 CONTROL: no seat journalled an item');
    if (seats < 2) problems.push('PLD-2 personal loot: only ' + seats + ' seat(s) found anything');
    if (a === d) problems.push('PLD-2 the lit hunt stored the dark hunt\'s bags: nothing rolled personally');
    if (closed.inst.world !== viewed.inst.world) problems.push('PLD-2 the doors stored different worlds');
    if (closed.inst.personal_loot !== true) problems.push('PLD-2 a hunt begun lit froze ' + closed.inst.personal_loot);
    const read = await one(closed.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [closed.users[0]]);
    if (!read || read.instance.personal_loot !== true) problems.push('PLD-2 a lit read hands ' + JSON.stringify(read && read.instance.personal_loot));
  } finally { if (edge) edge.done(); }
  return problems;
}

async function bounds(boot) {
  const problems = [];
  const { db } = await boot();
  const run = await prepare({ heroes: 4, windows: 8, hunt: MUSTER, door: 'pieces', db, level: 60, anchorMs: ANCHOR, gear: GEAR, beforeEnter: fixture({ lit: true }) });
  const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const ex = exec(db);
  let found = null;
  for (let w = 1; w <= 8 && !found; w++) {
    const plan = await M.HS.readHuntSettle({ exec: ex, user: run.users[0], slot: 0, atMs: run.fromMs + w * 90000 }, 'tick');
    if (plan.answer) return ['PLD-3 CONTROL: window ' + w + ' skipped (' + plan.answer.reason + ')'];
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    const i = p.commit.members.findIndex((m) => m.delta && m.delta.items && Object.keys(m.delta.items).some((k) => !START[k]));
    if (i >= 0) { found = { p, i }; break; }
    const res = await M.HS.commitHuntSettle(ex, { ...p.commit, project: null });
    if (!res || res.ok !== true) return ['PLD-3 CONTROL: window ' + w + ' refused ' + JSON.stringify(res).slice(0, 160)];
  }
  if (!found) return ['PLD-3 CONTROL: no proposal found an item in 8 windows'];
  const inv = async () => (await db.query('select coalesce(sum(qty), 0)::text as n from public.player_inventory')).rows[0].n;
  const before = await inv();
  const item = Object.keys(found.p.commit.members[found.i].delta.items).find((k) => !START[k]);
  const tampered = { ...found.p.commit, project: null, members: found.p.commit.members.map((m, j) => {
    if (j !== found.i) return m;
    const c = JSON.parse(JSON.stringify(m));
    c.delta.items[item] = 1000000;
    return c;
  }) };
  const res = await M.HS.commitHuntSettle(ex, tampered);
  if (!res || res.ok !== false || res.error !== 'value_over') problems.push('PLD-3 a seat claiming 1,000,000 ' + item + ' answered ' + JSON.stringify(res).slice(0, 160));
  if (await inv() !== before) problems.push('PLD-3 a refused commit moved a bag');
  const ok = await M.HS.commitHuntSettle(ex, { ...found.p.commit, project: null });
  if (!ok || ok.ok !== true) problems.push('PLD-3 CONTROL: the untampered proposal answered ' + JSON.stringify(ok).slice(0, 200));
  EVIDENCE.push('PLD-3 seat ' + found.i + ' claimed 1,000,000 ' + item + ': ' + (res && res.error) + '; the untampered window ' + (ok && ok.ok === true ? 'landed' : 'REFUSED'));
  return problems;
}

/* --mutate: a SQL defect planted in a replayed function body, or an edge defect planted on a copy of the edge */
const MUTANTS = [
  { name: 'the read hands the switch, not the frozen rule', fn: 'public.hr_hunt_instance_read(uuid,integer)',
    find: "'personal_loot', v_i.personal_loot,", repl: "'personal_loot', public.hr_flag_on('personal_loot'),", want: /^PLD-1/, test: frozen },
  { name: 'an UPDATE sets the frozen rule', fn: 'public.hr_hunt_loot_freeze()',
    find: 'new.personal_loot := old.personal_loot;', repl: 'null;', want: /^PLD-1/, test: frozen },
  { name: 'the freeze never reads the switch', fn: 'public.hr_hunt_loot_freeze()',
    find: "new.personal_loot := public.hr_flag_on('personal_loot');", repl: 'new.personal_loot := false;', want: /^PLD-2/, test: bothPaths },
  { name: 'the edge never hands the engine the rule', edits: [['supabase/functions/hr-accrue/hunt-settle.js', '    ...(inst.personal_loot === true ? { personalLoot: true } : {}),\n', '']], want: /^PLD-2/, test: bothPaths },
  { name: 'the seat\'s item bound is off', fn: 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)',
    find: "       and (e.value #>> '{}')::numeric > v_kills * coalesce((", repl: "       and false and (e.value #>> '{}')::numeric > v_kills * coalesce((", want: /^PLD-3/, test: bounds },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      const boot = async () => {
        const b = await bootReplay();
        if (m.fn) {
          const def = await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
          if (!def.replace(/\r/g, '').includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
          await b.db.exec(def.replace(/\r/g, '').replace(m.find, () => m.repl));
        }
        return b;
      };
      let got = [];
      try { got = await m.test(boot, { edits: m.edits || [] }); } catch (e) { got = [(/HARNESS/.test(String(e && e.message)) ? '' : 'THREW ') + String(e && e.message).slice(0, 200)]; }
      await closeReplays();
      if (got.some((p) => /HARNESS/.test(p))) { console.log('  HARNESS ' + m.name + ': ' + got[0]); process.exitCode = 2; return; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'personal-loot-db --mutate: ' + escaped + ' ESCAPED' : 'personal-loot-db --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  /* one case's replays at a time (an unclosed replay is ~300 MB) */
  const problems = [];
  for (const c of [frozen, bothPaths, bounds]) { problems.push(...await c(boot)); await closeReplays(); }
  for (const e of EVIDENCE) console.log('  ' + e);
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'personal-loot-db: ' + problems.length + ' FAILED' : 'personal-loot-db: green (dark and frozen, each seat\'s own bag both paths, the per-seat bound through the real commit)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
