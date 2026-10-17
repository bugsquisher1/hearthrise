// ============================================================================
// tests/activity-seam.mjs — THE ACTIVITY INTENT REFUSES WHAT THE ENGINE CANNOT PAY.
//
// The client half of this seam (src/net/activity.js, its declaration sites in
// src/legacy.js and their downgrade) was deleted with the old client on
// 2026-10-17. The SERVER half stays, because it is a lockout, not a display
// bug: if `set_activity` lets the pointer hold a bench the accrual engine
// cannot price, the engine refuses the COLLECT with `unpayable_bench`, which
// refuses every later SWITCH, and the player is stuck on that bench until a
// deploy. artisan-accrual's M8 (set_activity accepts an unpayable bench) is
// caught here and nowhere else.
//
//   S3  the data's gather index and the engine's GATHER_NODES have identical
//       keys and skills. A node the data lists and the engine cannot price
//       accrues nothing for the whole absence.
//   S6  an unpayable artisan recipe is refused 409 `activity_unsupported` ON
//       SHAPE (before any database statement); a payable one is not.
//   S6d the same, driven with the cooking settlement DISARMED through
//       artisan-sim's test seam, in a child process (catalogue.js fixes
//       ARTISAN_RECIPES_PAYABLE at load), so S6 is never vacuous while every
//       recipe happens to be payable.
//
// Node-only, no network. `runAll()` is imported by artisan-accrual's proof.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

const problems = [];
const fail = (m) => problems.push(m);

function diff(a, b) {
  const A = new Set(a); const B = new Set(b);
  return { onlyA: [...A].filter((x) => !B.has(x)), onlyB: [...B].filter((x) => !A.has(x)) };
}

const USER = '00000000-0000-4000-8000-000000000056';
const KEY = '00000000-0000-4000-8000-000000000001';
const NO_DB = async () => { throw new Error('reached the database — an unpayable bench must be refused on shape'); };

export async function runAll() {
  problems.length = 0;
  let server; let catalogue; let skillSim; let gathering; let artisan; let recipes;
  try {
    [server, catalogue, skillSim, gathering, artisan, recipes] = await Promise.all([
      import(mod('supabase/functions/hr-accrue/set-activity.js')),
      import(mod('supabase/functions/hr-accrue/catalogue.js')),
      import(mod('src/core/skill-sim.js')),
      import(mod('src/data/gathering.js')),
      import(mod('src/core/artisan-sim.js')),
      import(mod('src/data/recipes.js')),
    ]);
  } catch (e) {
    fail('the activity seam could not be loaded, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  /* ── S6 — the per-recipe refusal, through the REAL intent, no database. */
  const idx = artisan.indexArtisanRecipes(recipes.ARTISAN_RECIPES);
  const blocked = Object.keys(idx).filter((id) => !artisan.recipePayable(idx, id));
  const payable = Object.keys(idx).filter((id) => artisan.recipePayable(idx, id));
  if (!payable.length) fail('S6: NO artisan recipe is payable, so `artisan` pays nothing at all.');
  if (blocked.length) {
    const r = await server.runSetActivity({ exec: NO_DB, user: USER, slot: 0, intentId: KEY,
      activity: { kind: 'artisan', id: blocked[0] } });
    if (r.status !== 409 || !r.body || r.body.error !== 'activity_unsupported') {
      fail(`S6: set_activity answered ${r.status} ${JSON.stringify(r.body)} for the unpayable '${blocked[0]}'. `
        + 'It must be 409 activity_unsupported, or the pointer holds a bench the engine refuses — the switch lockout.');
    }
  }
  /* CONTROL: a payable recipe is NOT refused on shape (it reaches the database). */
  if (payable.length) {
    let reached = false;
    await server.runSetActivity({ exec: async () => { reached = true; throw new Error('stop here'); },
      user: USER, slot: 0, intentId: KEY, activity: { kind: 'artisan', id: payable[0] } }).catch(() => null);
    if (!reached) fail(`S6 CONTROL: the payable '${payable[0]}' was refused on shape — "refuse everything" would pass S6 and pay nothing.`);
  }

  /* ── S6d — the gate CLOSED: the cooking settlement disarmed in a child, so
     catalogue.js computes ARTISAN_RECIPES_PAYABLE with an unpayable bench. */
  {
    const probe = `const s = await import(${JSON.stringify(mod('src/core/artisan-sim.js'))});`
      + 's.__setCookingSettlementArm(false);'
      + `const R = await import(${JSON.stringify(mod('src/data/recipes.js'))});`
      + 'const idx = s.indexArtisanRecipes(R.ARTISAN_RECIPES);'
      + 'const shut = Object.keys(idx).find((id) => !s.recipePayable(idx, id)) || null;'
      + 'if (!shut) { console.log(JSON.stringify({ shut: null })); process.exit(0); }'
      + `const a = await import(${JSON.stringify(mod('supabase/functions/hr-accrue/set-activity.js'))});`
      + "const r = await a.runSetActivity({ exec: async () => { throw new Error('reached the database'); },"
      + ` user: '${USER}', slot: 0, intentId: '${KEY}', activity: { kind: 'artisan', id: shut } });`
      + 'console.log(JSON.stringify({ shut, status: r.status, error: r.body && r.body.error }));';
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' });
    let got = null;
    try { got = JSON.parse(String(r.stdout || '').trim().split('\n').pop()); } catch { got = null; }
    if (!got) fail(`S6d: the disarmed probe did not answer (${String(r.stderr || '').trim().slice(0, 160)})`);
    else if (!got.shut) fail('S6d: with the cooking settlement disarmed no recipe is unpayable — the refusal is untestable.');
    else if (got.status !== 409 || got.error !== 'activity_unsupported') {
      fail(`S6d: with its bench unpayable, set_activity answered ${JSON.stringify(got)}. It must be 409 `
        + 'activity_unsupported, or the pointer can hold a bench the engine refuses — the switch lockout.');
    }
  }

  /* ── S3 — one gather catalogue, two readers. */
  const dataIdx = skillSim.indexGatherNodes({
    woodcutting: gathering.TREES, mining: gathering.ROCKS, fishing: gathering.FISH_SPOTS,
  });
  const d3 = diff(Object.keys(dataIdx), Object.keys(catalogue.GATHER_NODES));
  if (d3.onlyA.length || d3.onlyB.length) {
    fail(`S3: the data's gather index and the engine's GATHER_NODES disagree — data-only [${d3.onlyA.join(', ')}], `
      + `engine-only [${d3.onlyB.join(', ')}].`);
  }
  for (const id of Object.keys(dataIdx)) {
    const b = catalogue.GATHER_NODES[id];
    if (b && dataIdx[id].skill !== b.skill) fail(`S3: '${id}' is ${dataIdx[id].skill} in the data and ${b.skill} in the engine.`);
  }
  if (!Object.keys(dataIdx).length) fail('S3: the gather index is EMPTY, so S3 compared nothing.');
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const found = await runAll();
  if (found.length) {
    for (const p of found) console.error('FAIL: ' + p + '\n');
    console.error(`activity-seam: ${found.length} problem(s)`);
    process.exit(1);
  }
  console.log('activity-seam: OK (S3, S6, S6d)');
}
