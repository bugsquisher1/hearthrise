// ════════════════════════════════════════════════════════════════════════
// tests/state-of-farm-projection.mjs — Q-2 + Q-5: THE TWO SERVER-OWNED FARM
//                                      FACTS THAT WERE LOST ON RELOAD.
//
// Both bugs are one class: the server is the author of record for a farm fact,
// hr_state_of does not project it, and under BLOB_RETIRED the reload rebuilds the
// farm WITHOUT it — so the client's fail-safe default becomes the player's
// reality. Neither is exploitable; both LOSE value the server is already holding.
//
//   Q-2  player_state.plot_level (written only by hr_farm_upgrade_plot) was not
//        projected → reconcileFarm left G.plotLevels alone → getPlotLevel()
//        forced Lv 1: unlocked seeds vanished on reload and the Upgrade button
//        quoted the Lv-2 price while the server charged the Lv-4 one.
//   Q-5  player_farm.waterings (timestamptz[], the exact input to
//        hr_farm_growth_hours) was projected as the single scalar watered_at →
//        the client rebuilt a ONE-element array → its growthHours under-counted
//        by up to 14 effective hours and its isReady disagreed with the server's,
//        stranding a ready crop behind a Water button.
//
// This guard drives the WHOLE path, end to end, with no credentials:
//
//   hr_farm_upgrade_plot / hr_farm_water write the server rows   (real RPCs)
//     → hr_state_of PROJECTS state.plot_level + farm[].waterings (real SQL)
//       → src/net/accrue.js reconcileFarm mirrors both into a FRESH G — the
//         blob-retired reload state                                (real client)
//         → src/core/farm.js growthHours() on the rebuilt plot equals
//           hr_farm_growth_hours() on the server row               (AGREEMENT)
//
// The agreement check is the one that matters: a projection that is array-SHAPED
// but not array-VALUED passes every "does the key exist" assertion and still
// ships the bug.
//
// Run GREEN:  node tests/state-of-farm-projection.mjs
// Prove RED:  node tests/state-of-farm-projection.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { bootReplay } from './schema-replay.mjs';
import { growthHours, isReady } from '../src/core/farm.js';

const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;
const MIG = '2026-09-06-state-of-farm-projection.sql';

const uidFor = (n) => `000000f2-0000-0000-0000-0000000000${n}`;
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});

/* reconcileFarm is ARM-GATED on window.HearthriseCapstone.isBlobRetired() and
   promotes a ready plot via window.HearthriseFarm.isReady — both read off
   `window` at CALL time. Stub them LOCALLY around the client block only: PGlite
   also probes `window`, and a partial global stub breaks bootReplay. */
function withArmedClient(crops, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window');
  const prev = globalThis.window;
  globalThis.window = {
    HearthriseCapstone: { isBlobRetired: () => true },
    HearthriseFarm: { isReady: (p) => isReady(p, crops, Date.now()) },
  };
  try { return fn(); }
  finally { if (had) globalThis.window = prev; else delete globalThis.window; }
}

/* ── THE GATE-BLIND PAIR ───────────────────────────────────────────────────
   Every mutation below is ALSO run with the migration's own Sec 2 commit gate
   short-circuited, because a tick that only means "the apply threw" is the
   renown-faucet lesson: it proves the MIGRATION can fail, not that THIS GUARD
   can see anything. That gate fires at apply time and once only; the regression
   that actually brings these two bugs back is a LATER migration restating
   hr_state_of from a stale template, at which point Sec 2 never runs again and
   this guard is the only thing left standing. So each defect is caught TWICE —
   once by the gate, once by the guard alone. */
const GATE_BLIND = [
  `  raise notice 'state-of-farm-projection: hr_state_of projects player_state.plot_level and the per-plot '
               'waterings array, watered_at/planted_at/streak_days/marks all survived, no new write grant, '
               'not client-executable, no cross-player rows — all green';
end $$;`,
  `  null;
exception when others then
  raise notice 'Sec 2 SHORT-CIRCUITED FOR THE MUTATION PROOF: %', sqlerrm;
end $$;`,
];

/* ── MUTATIONS ─────────────────────────────────────────────────────────────
   Each plants a REAL defect in the REAL migration text and must turn the guard
   RED. The first two are the two shipped bugs, restored. The rest prove the
   guard is watching the load-bearing details rather than the key names. */
const MUTATIONS = {
  plot_level_not_projected: {
    file: MIG,
    why: 'THE Q-2 BUG: hr_state_of projects the tier under a name the client does not read, so a '
       + 'reload rebuilds G without the farm tier and getPlotLevel() falls back to Lv 1 — unlocked '
       + 'seeds vanish. (A key RENAME rather than a deletion: deleting the line leaves an unbalanced '
       + 'quote inside the spliced string literal, which is a SYNTAX error, and a syntax error is a '
       + 'HARNESS failure dressed up as a catch — the renown-faucet lesson.)',
    find: "      ''plot_level'', v_st.plot_level,');",
    repl: "      ''plotLevel'', v_st.plot_level,');",
  },
  waterings_not_projected: {
    file: MIG,
    why: 'THE Q-5 BUG: hr_state_of stops projecting the waterings array, so the client rebuilds a '
       + 'one-element history from watered_at and its isReady disagrees with the server',
    find: "                                          'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))$new$);",
    repl: "                                          'watered_at', watered_at)$new$);",
  },
  waterings_truncated_to_last: {
    file: MIG,
    why: 'the array is projected but carries only the LAST watering — array-SHAPED, not array-VALUED. '
       + 'Every key-existence assertion still passes and the bug ships',
    find: "'waterings', coalesce(to_jsonb(waterings), '[]'::jsonb))$new$);",
    repl: "'waterings', coalesce(to_jsonb(waterings[array_length(waterings,1):array_length(waterings,1)]), '[]'::jsonb))$new$);",
  },
  plot_level_hardcoded: {
    file: MIG,
    why: 'the key is projected but from a constant instead of the row — the classic "the field is '
       + 'there, the value is a default" projection defect',
    find: "      ''plot_level'', v_st.plot_level,');",
    repl: "      ''plot_level'', 1,');",
  },
  watered_at_dropped: {
    file: MIG,
    why: 'the waterings splice EATS the scalar watered_at an older client still reads — a projection '
       + 'must be additive, and removing a key is a breaking change',
    find: "    v_def := replace(v_def, c_farm, $new$'planted_at', planted_at, 'watered_at', watered_at,",
    repl: "    v_def := replace(v_def, c_farm, $new$'planted_at', planted_at,",
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(mutate, gateBlind) {
  if (!mutate) { const { db } = await bootReplay(); return db; }
  const m = MUTATIONS[mutate];
  const pairs = [[m.find, m.repl]];
  if (gateBlind) pairs.push(GATE_BLIND);
  const { db } = await bootReplay({ patches: new Map([[m.file, pairs]]) });
  return db;
}

async function seed(db, uid, deeds) {
  await db.exec(`insert into auth.users (id) values ('${uid}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, version)
                 values ('${uid}', 0, 1000000, 0, 1)
                 on conflict (user_id, slot) do update set gold=1000000, version=1;`);
  await db.exec(`insert into public.player_inventory (user_id, slot, item_id, qty)
                 values ('${uid}', 0, 'farm_deed', ${deeds})
                 on conflict (user_id, slot, item_id) do update set qty=${deeds};`);
}

async function asUser(db, uid, sql, params) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
  /* The four farm RPCs are the CLIENT-callable kind (granted to `authenticated`,
     uid derived from the JWT claim inside a SECURITY DEFINER body) — not the
     engine-only kind. Calling them as hr_engine is a 42501. */
  await db.exec('set role authenticated');
  try { return await db.query(sql, params); }
  finally { await db.exec('reset role'); }
}

async function runAll(db) {
  const A = uidFor('a1');
  // Enough deeds for two upgrades (the ladder lives in hr_plot_tier — read it,
  // never hardcode a balance value the Designer owns).
  const ladder = (await db.query(
    `select plot_level, deed_cost from public.hr_plot_tier where plot_level in (2,3) order by plot_level`)).rows;
  ok(ladder.length === 2, `hr_plot_tier has tiers 2 and 3 (got ${ladder.length})`);
  /* +1: hr_farm_upgrade_plot debits with `qty > v_cost` and otherwise DELETES the
     stack, so an exact balance still pays — but seeding one spare keeps the
     fixture about the projection rather than about that edge. */
  const need = ladder.reduce((n, r) => n + Number(r.deed_cost), 0) + 1;
  await seed(db, A, need);

  // ── Q-2: TWO REAL UPGRADES → plot_level 3, written only by the server ─────
  for (let i = 0; i < 2; i++) {
    const r = (await asUser(db, A,
      'select public.hr_farm_upgrade_plot(0, $1::uuid) as res', [uuid()])).rows[0].res;
    ok(r && r.ok === true, `hr_farm_upgrade_plot #${i + 1} ok (got ${JSON.stringify(r && r.error)})`);
  }
  const serverTier = Number((await db.query(
    `select plot_level from public.player_state where user_id=$1 and slot=0`, [A])).rows[0].plot_level);
  ok(serverTier === 3, `the SERVER row says plot_level 3 (got ${serverTier})`);

  // ── Q-5: plant, then water FOUR times over a spread the growth model can see ──
  // hr_farm_water appends now(); rather than fight the clock, plant in the past
  // and write the history the RPC would have written, then prove the RPC APPENDS
  // (rather than overwrites) so the projected array is the one it maintains.
  /* The LONGEST tier-1 crop: the plot must still be GROWING after four hours
     plus four waterings, or hr_farm_water refuses with already_ready and the
     fixture stops exercising the history at all. */
  const cropRow = (await db.query(
    `select k.crop_id, k.base_hours from public.hr_crops k
       join public.hr_crop_plot_tier t on t.crop_id = k.crop_id
      where t.plot_tier <= 3 order by k.base_hours desc, k.crop_id limit 1`)).rows[0];
  const crop = cropRow.crop_id;
  const baseH = Number(cropRow.base_hours);
  /* THE FIXTURE WINDOW, stated so a Designer ladder change fails loudly rather
     than silently making this vacuous. Plant 4h ago and seed three waterings at
     3.5/3/2.5h — all older than the 2h WATER_WINDOW, so hr_farm_water accepts a
     FOURTH (it refuses `still_watered` inside the window) — which makes the
     server's effective growth 4 + min(3x2, 4) = 8h. The crop must need MORE than
     that or the plot is already_ready and the RPC refuses for the other reason. */
  ok(baseH > 8, `the fixture crop needs more than the 8 effective hours the fixture produces `
     + `(${crop} base_hours ${baseH}) — pick a longer crop or retune the ages above`);
  const ago = (h) => `now() - interval '${(h * 3600).toFixed(0)} seconds'`;
  await db.exec(`insert into public.player_farm (user_id, slot, plot_idx, crop_id, planted_at, watered_at, waterings)
    values ('${A}', 0, 0, '${crop}', ${ago(4)}, ${ago(2.5)},
            array[${ago(3.5)}, ${ago(3)}, ${ago(2.5)}]::timestamptz[])
    on conflict (user_id, slot, plot_idx) do update
      set crop_id=excluded.crop_id, planted_at=excluded.planted_at,
          watered_at=excluded.watered_at, waterings=excluded.waterings;`);
  const wr = (await asUser(db, A,
    'select public.hr_farm_water(0, 0, $1::uuid) as res', [uuid()])).rows[0].res;
  ok(wr && wr.ok === true, `hr_farm_water ok (got ${JSON.stringify(wr && wr.error)})`);
  const row = (await db.query(
    `select planted_at, watered_at, waterings from public.player_farm
      where user_id=$1 and slot=0 and plot_idx=0`, [A])).rows[0];
  ok(Array.isArray(row.waterings) && row.waterings.length === 4,
     `the server row holds all FOUR waterings (got ${row.waterings && row.waterings.length})`);

  // ── THE ENVELOPE — what a reload actually reads ───────────────────────────
  const env = (await db.query(`select public.hr_state_of($1::uuid, 0) as env`, [A])).rows[0].env;
  ok(env && env.state && Number(env.state.plot_level) === 3,
     `hr_state_of PROJECTS state.plot_level = 3 (got ${env && env.state && env.state.plot_level})`);
  const fp = env && Array.isArray(env.farm) ? env.farm[0] : null;
  ok(!!fp, 'hr_state_of projects the planted plot');
  ok(Array.isArray(fp && fp.waterings) && fp.waterings.length === 4,
     `hr_state_of PROJECTS all four waterings (got ${fp && JSON.stringify(fp.waterings)})`);
  ok(fp && fp.watered_at != null,
     'watered_at is STILL projected — the splice is additive, an older client reads it');
  ok(fp && fp.planted_at != null, 'planted_at survived the splice');
  ok(env && env.state && env.state.marks !== undefined,
     'the marks projection survived — this migration did not restate a stale body');

  // ── THE SERVER'S OWN GROWTH NUMBER, from the row it will harvest against ──
  const nowIso = (await db.query(`select now() as n`)).rows[0].n;
  const srvHours = Number((await db.query(
    `select public.hr_farm_growth_hours($1::timestamptz, $2::timestamptz[], $3::timestamptz) as h`,
    [row.planted_at, row.waterings, nowIso])).rows[0].h);
  const srvOneWatering = Number((await db.query(
    `select public.hr_farm_growth_hours($1::timestamptz, array[$2::timestamptz], $3::timestamptz) as h`,
    [row.planted_at, row.watered_at, nowIso])).rows[0].h);
  ok(srvHours > srvOneWatering,
     `the fixture is NON-VACUOUS: four waterings (${srvHours.toFixed(3)}h) must be worth more than one `
     + `(${srvOneWatering.toFixed(3)}h), or the agreement check below could not tell them apart`);

  // ── THE CLIENT — a FRESH G, exactly what the blob-retired reload produces ──
  let A2;
  try {
    const src = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
    const m = src.match(/item-authority\.js\?v=(\d+)/);
    A2 = await import(mod('src/net/accrue.js' + (m ? `?v=${m[1]}` : '')));
  } catch (e) {
    ok(false, 'could not load accrue.js, so the CLIENT half did not run: ' + (e && e.message));
    return;
  }
  ok(typeof A2.reconcileFarm === 'function', 'accrue.js exports reconcileFarm');

  // The REAL crop hours, read from the same catalogue the server used — so
  // isReady() on the rebuilt plot is the game's own question, not a stub's.
  const crops = { [crop]: { hours: baseH } };
  withArmedClient(crops, () => {
    const G = {};                              // no farmPlots, no plotLevels — a reload
    const r = A2.reconcileFarm(G, env, { authoritative: true });
    ok(r && r.mode === 'server', `reconcileFarm ran armed (mode ${r && r.mode})`);

    // Q-2
    ok(G.plotLevels === 3, `G.plotLevels = 3 after reload — NOT the Lv 1 fail-safe (got ${G.plotLevels})`);

    // Q-5
    const plot = G.farmPlots && G.farmPlots[0];
    ok(!!plot, 'reconcileFarm rebuilt the plot');
    ok(Array.isArray(plot && plot.waterings) && plot.waterings.length === 4,
       `the rebuilt plot carries all FOUR waterings (got ${plot && JSON.stringify(plot.waterings)})`);

    // THE AGREEMENT. Same instant on both sides, so the only variable is the
    // watering history. 1e-3 h = 3.6 s of tolerance for the clock between the
    // two reads and for numeric/float formatting — not for a missing watering,
    // which is worth up to two whole hours.
    const nowMs = Date.parse(nowIso);
    const cliHours = plot ? growthHours(plot, nowMs) : NaN;
    ok(Math.abs(cliHours - srvHours) < 1e-3,
       `the client's growthHours (${cliHours.toFixed(4)}h) AGREES with hr_farm_growth_hours `
       + `(${srvHours.toFixed(4)}h) — Q-5 fixed`);

    // FAIL-CLOSED, both directions.
    const G2 = {};
    const noArr = { ...env, farm: env.farm.map((p) => { const q = { ...p }; delete q.waterings; return q; }) };
    A2.reconcileFarm(G2, noArr, { authoritative: true });
    ok(((G2.farmPlots[0] || {}).waterings || []).length === 1,
       'a server predating the projection degrades to the single watered_at, NOT to an empty history');

    const G3 = {};
    const junk = { ...env, farm: env.farm.map((p) => ({ ...p, waterings: ['nope', null, (p.waterings || [p.watered_at])[0]] })) };
    A2.reconcileFarm(G3, junk, { authoritative: true });
    ok(((G3.farmPlots[0] || {}).waterings || []).length === 1,
       'unparseable waterings are DROPPED, never defaulted to now() (which would mint a bonus)');

    const G4 = { plotLevels: 4 };
    A2.reconcileFarm(G4, { ...env, state: { ...env.state, plot_level: undefined } }, { authoritative: true });
    ok(G4.plotLevels === 4,
       'an envelope without plot_level leaves G.plotLevels UNTOUCHED (never invented, never reset)');
  });
}

const argv = process.argv.slice(2);
if (argv.includes('--selftest')) {
  console.log('state-of-farm-projection --selftest: each mutation must turn the guard RED');
  {
    const save = failed; failed = 0;
    const db = await boot(null); await runAll(db);
    if (failed) { console.error(`\nFLOOR CHECK FAILED: the CLEAN pass is already red (${failed}).`); process.exit(2); }
    failed = save;
  }
  let bad = 0;
  let n = 0;
  for (const name of Object.keys(MUTATIONS)) {
    for (const gateBlind of [false, true]) {
      n++;
      const label = gateBlind ? `${name} [gate-blind]` : name;
      const saveFail = failed; failed = 0; let threw = false;
      try { const db = await boot(name, gateBlind); await runAll(db); }
      catch (e) { threw = true; console.log(`  ${label}: RED (threw: ${String(e.message).split('\n')[0]})`); }
      const wentRed = failed > 0 || threw; failed = saveFail;
      /* A gate-blind arm that only THROWS is not this guard's tick — the short-
         circuit is supposed to let the apply through, so a throw there means the
         neutering did not take and the arm proved nothing. */
      if (gateBlind && threw) {
        bad++;
        console.error(`  x ${label}: the SEC-2 short-circuit did NOT take (the apply still threw), so this arm `
          + "demonstrated the MIGRATION's gate again rather than the guard. Fix GATE_BLIND.");
        continue;
      }
      if (wentRed) { if (!threw) console.log(`  ${label}: RED (assertions failed) — ${MUTATIONS[name].why}`); }
      else { bad++; console.error(`  x ${label}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
    }
  }
  if (bad) { console.error(`\n${bad} mutation arm(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${n} mutation arms caught (${Object.keys(MUTATIONS).length} defects x gate / gate-blind). `
    + 'The guard is non-vacuous in its own right.');
  process.exit(0);
} else {
  const db = await boot(null);
  await runAll(db);
  if (failed) { console.error(`\nstate-of-farm-projection: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('state-of-farm-projection: hr_state_of projects player_state.plot_level and the full per-plot '
    + 'waterings array; a fresh reloaded G reads BOTH back and its growthHours agrees with '
    + 'hr_farm_growth_hours — Q-2 (farm tier resets to Lv 1) and Q-5 (multi-watering collapses to one) fixed.');
  process.exit(0);
}
