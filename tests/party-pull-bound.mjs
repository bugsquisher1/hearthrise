#!/usr/bin/env node
// tests/party-pull-bound.mjs — A PARTY'S DEFAULT PULL STAYS INSIDE THE SERVER'S KILL BOUND (lane/b-party-class-xp, 2026-11-01).
//
//   node tests/party-pull-bound.mjs            the guard
//   node tests/party-pull-bound.mjs --mutate   the proof: the catalogue's old spawns turn it red with kills_over
//
// THE RISK (found playing it): a party with no pick plays its ground's default pull (hunt-grounds.js partyPull) at a frozen
// hunt_instances.density of 0, and hr_hunt_apply_member's kill bound is spawns + pockets x that density. With the as-built
// spawns a four's every window was refused kills_over and the sixth refusal forfeited the hunt: the class of the P0 #57. So
// hr_hunt_grounds.spawns carries pockets x the largest pull (tools/gen-hunt-sessions.mjs).
//
// THE MEASURE: the replayed chain (PGlite), four heroes in one party with the leader's pick unset, settled through the shipped
// world tick for several 90 s windows (tools/settle-cost.mjs's `fire` door, the browser closed), on the Cellar (the largest
// pull, on the smallest bound) and the Thicket. Every window lands. The party's world really stands at the pull (the control),
// and the frozen density stays 0. The file's own self-check refuses the as-built spawns, and a second apply moves no byte.
//
// mutant-anchors: none — the mutant is SQL patched into the booted replay, not an anchored patch of a file.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { decodeStored } from '../src/core/hunt/world-state.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';

const GROUNDS = Object.freeze(['mill_cellar', 'meadowbrook_thicket']);
const WINDOWS = 3;
const CATALOGUE = '2027-02-16-party-pull-hunt-sessions-catalogue.generated.sql';

/** Play a four on `hunt` on `db`: the problems found, as words. */
async function play(db, hunt) {
  const problems = [];
  const run = await prepare({ heroes: 4, windows: WINDOWS, hunt, door: 'fire', db });
  let landed = 0;
  try {
    await run.warm();
    landed++;
    for (let w = 2; w <= WINDOWS + 1; w++) { await run.step(w); landed++; }
  } catch (e) { problems.push(hunt + ': window ' + (landed + 1) + ' did not land: ' + String(e && e.message).slice(0, 300)); }
  const row = (await db.query(`select density, world::text as world from public.hunt_instances where hunt_id = $1 order by created_at desc limit 1`, [hunt])).rows[0];
  if (!row) return problems.concat(hunt + ': no instance');
  if (Number(row.density) !== 0) problems.push(hunt + ': the instance froze density ' + row.density + ', a party with no pick freezes 0');
  if (!problems.length) {
    const world = row.world ? decodeStored(JSON.parse(row.world)) : null;
    const want = HUNT_GROUNDS[hunt].partyPull[3];
    /* the control: the party really played its pull, or the bound was never asked */
    if (!world || world.density !== want) problems.push(hunt + ': CONTROL: the world stands at density ' + (world && world.density) + ', want the four\'s pull ' + want);
    if (landed !== WINDOWS + 1) problems.push(hunt + ': ' + landed + ' windows landed, want ' + (WINDOWS + 1));
  }
  return problems;
}

/* THE FILE ITSELF, over the chain: its §4 self-check refuses the as-built spawns, and a second apply moves no byte of any
   table it writes, of the world shape, or of any public function. */
async function selfCheck(db) {
  const problems = [];
  const text = readFileSync(join(ROOT, 'supabase', 'migrations', CATALOGUE), 'utf8');
  const row = "('mill_cellar', 'mill_cellar', 2, 15, 32000,";
  if (text.split(row).length !== 2) return ['the Cellar\'s row is not in ' + CATALOGUE + ' exactly once: ' + row];
  await db.query('begin');
  let err = null;
  try { await db.exec(text.replace(row, "('mill_cellar', 'mill_cellar', 2, 5, 32000,")); } catch (e) { err = String(e && e.message); }
  await db.query('rollback');
  if (!err || !err.includes('largest default pull')) problems.push('the self-check answered ' + (err ? err.slice(0, 160) : 'nothing (it applied)') + ' on the Cellar\'s as-built spawns');
  const image = async () => {
    const out = {};
    for (const t of ['hr_hunt_grounds', 'hr_hunt_ground_spawns', 'hr_hunt_kill_bounds', 'hr_hunt_limits', 'hr_hunt_vendor_value', 'hr_hunt_cover_items', 'hr_hunt_world_shape']) {
      out[t] = (await db.query(`select md5(coalesce(string_agg(x.r, '|' order by x.r), '')) m from (select t::text r from public.${t} t) x`)).rows[0].m;
    }
    out.functions = (await db.query(`select md5(string_agg(p.oid::regprocedure::text || pg_get_functiondef(p.oid), '|' order by p.oid::regprocedure::text)) m
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'`)).rows[0].m;
    return JSON.stringify(out);
  };
  const before = await image();
  await db.exec(text);
  const after = await image();
  if (before !== after) problems.push('a second apply moved something: ' + before + ' -> ' + after);
  return problems;
}

async function main() {
  if (process.argv.includes('--mutate')) {
    /* The as-built spawns back on the row, in the row and in the self-check that pins it. */
    const { db } = await bootReplay({ patches: new Map([[CATALOGUE, [["('mill_cellar', 'mill_cellar', 2, 15, 32000,", "('mill_cellar', 'mill_cellar', 2, 5, 32000,"],
      ["('mill_cellar', 2, 15)", "('mill_cellar', 2, 5)"]]]]), upTo: CATALOGUE });
    const got = await play(db, 'mill_cellar');
    const hit = got.some((p) => /kills_over/.test(p));
    console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' the as-built spawns on the Cellar: ' + (got[0] || 'every window landed').slice(0, 160));
    console.log(hit ? 'party-pull-bound --mutate: 1/1 caught' : 'party-pull-bound --mutate: 1 ESCAPED');
    process.exitCode = hit ? 0 : 1;
    return;
  }
  const problems = [];
  /* One replay a ground: the fixture's heroes are one party, and its hunt is its ground. */
  let last = null;
  for (const hunt of GROUNDS) {
    const { db } = await bootReplay();
    problems.push(...await play(db, hunt));
    last = db;
  }
  problems.push(...await selfCheck(last));
  for (const p of problems) console.log('  ✗ ' + p);
  console.log(problems.length ? 'party-pull-bound: RED' : 'party-pull-bound: a four with no pick lands ' + (WINDOWS + 1) + ' windows of 90 s on ' + GROUNDS.join(' and '));
  process.exitCode = problems.length ? 1 : 0;
}
if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
