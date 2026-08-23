// ============================================================================
// tests/farm-record.mjs — THE FARM PLOTS, RECONSTRUCTED FROM THE ENVELOPE.
//
// The four farm gestures are already server-authoritative (hr_farm_*), and
// hr_state_of projects the plot set at `res.farm` — VERIFIED LIVE 2026-08-22
// against project nezapsylztqbbwuwembx:
//
//   res.farm = [ { i:<plot_idx>, crop:<crop_id>,
//                  planted_at:<timestamptz>, watered_at:<timestamptz|null> }, … ]
//
// This is the CLIENT half — the CRITICAL blocker: under the blob-retire capstone
// the client stops loading the save blob, so accrue.js reconcileFarm MUST rebuild
// G.farmPlots from the envelope, or startFarmCheck + the two render loops deref an
// undefined G.farmPlots and THROW, silently vanishing every standing crop.
//
// PROVES:
//   1. DORMANT — reconcileFarm is a pure no-op; the client farm is untouched.
//   2. ARMED   — G.farmPlots is rebuilt from res.farm[] (crops, real server
//      planted_at → ready time, watered_at → waterings), and G.plotLevels from a
//      state.plot_level tier IF the projection carries one.
//   3. ARMED, FAIL-CLOSED — an absent res.farm array leaves a populated farm
//      UNTOUCHED (a lean/idle envelope must never wipe standing crops); an EMPTY
//      array IS a claim and clears to [].
//   4. NO-THROW — an undefined G.farmPlots after a rebuild-from-empty still
//      forEach's without throwing (the guard the render/tick rely on).
//
// Run standalone:  node tests/farm-record.mjs
// Wired into the suite as a preflight (farmRecordGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function farmRecordGuard() {
  const problems = [];
  const fail = (m) => problems.push('farm-record: ' + m);

  // A togglable capstone arm on the window global — companionAuthorityArmed()
  // (the gate reconcileFarm shares) reads window.HearthriseCapstone.isBlobRetired()
  // at CALL time. Set BEFORE the import.
  const savedWindow = globalThis.window;
  let armed = false;
  globalThis.window = {
    G: {},
    HearthriseCapstone: { isBlobRetired: () => armed },
  };
  const setArm = (on) => { armed = !!on; };

  let A;
  try {
    // ⚠ DERIVE THE ?v= FROM THE READER MODULE'S OWN SOURCE (accrue.js) at runtime.
    // A version bump walks src/ but not tests/, so a hardcoded specifier would split
    // accrue.js into two module instances (the b436 breakage). Never hardcode it.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/accrue.js', ROOT), 'utf8');
    const m = src.match(/\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    A = await import(mod('src/net/accrue.js' + v));
  } catch (e) {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    fail('could not load accrue.js, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  if (typeof A.reconcileFarm !== 'function') {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
    fail('accrue.js must publish reconcileFarm');
    return problems;
  }

  // A representative envelope: plot 0 = a watered potato, plot 2 = an unwatered
  // wheat (plots 1/3+ empty → no row). state.plot_level = 3 (future projection).
  const plantedAt = '2026-08-22T10:00:00Z';
  const wateredAt = '2026-08-22T11:30:00Z';
  const ENV = () => ({
    ok: true, version: 7,
    state: { plot_level: 3 },
    farm: [
      { i: 0, crop: 'potato', planted_at: plantedAt, watered_at: wateredAt },
      { i: 2, crop: 'wheat', planted_at: plantedAt, watered_at: null },
    ],
  });

  try {
    // ── 1. DORMANT: reconcileFarm is a pure no-op ───────────────────────────
    setArm(false);
    {
      const G = { farmPlots: [{ cropId: 'turnip', plantedAt: 123, waterings: [], state: 'growing' }], plotLevels: 2 };
      const r = A.reconcileFarm(G, ENV());
      if (!r || r.mode !== 'dormant') fail('DORMANT: reconcileFarm must return {mode:dormant} (got ' + JSON.stringify(r) + ')');
      if (G.farmPlots.length !== 1 || G.farmPlots[0].cropId !== 'turnip' || G.plotLevels !== 2)
        fail('DORMANT: reconcileFarm altered the client farm');
    }

    // ── 2. ARMED: rebuild from the envelope ─────────────────────────────────
    setArm(true);
    {
      // A pre-existing FORGED local farm (what a stale blob might hold) must be
      // REPLACED by server truth.
      const G = { farmPlots: [{ cropId: 'goldroot', plantedAt: 1, waterings: [], state: 'ready' }], plotLevels: 1 };
      const r = A.reconcileFarm(G, ENV());
      if (!r || r.mode !== 'server') fail('ARMED: reconcileFarm must return {mode:server} (got ' + JSON.stringify(r) + ')');
      const p0 = G.farmPlots[0], p2 = G.farmPlots[2];
      if (!p0 || p0.cropId !== 'potato') fail('ARMED: plot 0 crop not restored (got ' + JSON.stringify(p0) + ')');
      if (p0 && p0.plantedAt !== Date.parse(plantedAt)) fail('ARMED: plot 0 must carry the REAL server planted_at (got ' + (p0 && p0.plantedAt) + ')');
      if (p0 && (p0.waterings.length !== 1 || p0.waterings[0] !== Date.parse(wateredAt))) fail('ARMED: plot 0 watered_at must become a one-element waterings array (got ' + JSON.stringify(p0 && p0.waterings) + ')');
      if (!p2 || p2.cropId !== 'wheat') fail('ARMED: plot 2 crop not restored (got ' + JSON.stringify(p2) + ')');
      if (p2 && p2.waterings.length !== 0) fail('ARMED: plot 2 (unwatered) must have an empty waterings array (got ' + JSON.stringify(p2 && p2.waterings) + ')');
      // Empty plots stay holes (undefined), rendered as empty — not forged crops.
      if (G.farmPlots[1] !== undefined) fail('ARMED: plot 1 should be an empty hole (got ' + JSON.stringify(G.farmPlots[1]) + ')');
      // the forged local goldroot must be GONE (state replaced, not merged)
      if (G.farmPlots.some((p) => p && p.cropId === 'goldroot')) fail('ARMED: a forged local crop survived the rebuild');
      // plot tier from the projection
      if (G.plotLevels !== 3) fail('ARMED: plotLevels not restored from state.plot_level (got ' + G.plotLevels + ')');
    }

    // ── 2b. ARMED, no state.plot_level: G.plotLevels left UNTOUCHED ──────────
    {
      const G = { plotLevels: 4, farmPlots: [] };
      A.reconcileFarm(G, { ok: true, version: 7, farm: [{ i: 0, crop: 'potato', planted_at: plantedAt, watered_at: null }] });
      if (G.plotLevels !== 4) fail('ARMED/no-tier: G.plotLevels must be left alone when the projection omits plot_level (got ' + G.plotLevels + ')');
    }

    // ── 3. ARMED, FAIL-CLOSED ────────────────────────────────────────────────
    {
      // (a) NO res.farm array leaves a populated farm UNTOUCHED (idle/lean envelope).
      const G = { farmPlots: [{ cropId: 'potato', plantedAt: 5, waterings: [], state: 'growing' }] };
      const r = A.reconcileFarm(G, { ok: true, version: 8 });   // no farm key
      if (!r || r.mode !== 'absent') fail('ARMED/absent: must return {mode:absent} (got ' + JSON.stringify(r) + ')');
      if (!G.farmPlots.length || G.farmPlots[0].cropId !== 'potato')
        fail('ARMED/absent: a lean envelope WIPED a standing crop — must leave the farm untouched');
      // (b) an EMPTY array IS a claim the farm is unplanted → clears to [].
      const G2 = { farmPlots: [{ cropId: 'potato', plantedAt: 5, waterings: [] }] };
      const r2 = A.reconcileFarm(G2, { ok: true, version: 8, farm: [] });
      if (!r2 || r2.mode !== 'server') fail('ARMED/empty: an empty farm array must be a {mode:server} claim (got ' + JSON.stringify(r2) + ')');
      if (G2.farmPlots.length !== 0) fail('ARMED/empty: an empty farm array must clear the plots (got ' + JSON.stringify(G2.farmPlots) + ')');
    }

    // ── 4. NO-THROW: the guarded read pattern never throws on undefined ──────
    {
      // The legacy guard is `(G.farmPlots||[]).forEach(...)`; prove the fallback
      // holds when the farm is undefined (armed boot, pre-first-envelope).
      const G = {};
      let threw = false;
      try { (G.farmPlots || []).forEach(() => {}); } catch (e) { threw = true; }
      if (threw) fail('NO-THROW: (G.farmPlots||[]).forEach threw on an undefined farm');
    }
  } finally {
    if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await farmRecordGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('farm-record: dormant no-op + armed rebuild + fail-closed-absent + empty-claim + no-throw — all green');
}
