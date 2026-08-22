// ============================================================================
// tests/farm-sync.mjs — THE CLIENT FARM TRANSPORT, PROVEN BOTH WAYS.
//
// Server-side correctness of hr_farm_plant / hr_farm_water / hr_farm_harvest /
// hr_farm_upgrade_plot is proven by the §10 self-check inside
// 2026-08-22-server-farming-complete.sql. This is the CLIENT half:
//   · DORMANT (FARM_SERVER_ARM_ENABLED=false): the arm predicate is false, so
//     the legacy farm writers run client-side as today (no regression).
//   · ARMED: the four gestures build the right RPC calls (endpoint + body shape,
//     only ids/slots/plot indices cross the wire), reconcileFarmResult renders
//     the RESPONSE into G, harvest applies the server's produce ONCE (no local
//     roll → no double credit), and every failure is non-fatal.
//
// Run standalone:  node tests/farm-sync.mjs
// Wired into the suite as a preflight (farmSyncGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function farmSyncGuard() {
  const problems = [];
  const fail = (m) => problems.push('farm-sync: ' + m);

  let F, IA;
  try {
    // ⚠ MATCH THE SPECIFIER farm-sync.js USES (it imports ../data/item-authority.js?v=NNN).
    // Derive the CURRENT ?v= from farm-sync.js's OWN source so the test can never
    // drift out of lockstep with a version bump (the b436 breakage class).
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/farm-sync.js', ROOT), 'utf8');
    const m = src.match(/item-authority\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    F = await import(mod('src/net/farm-sync.js'));
    IA = await import(mod('src/data/item-authority.js' + v));
  } catch (e) {
    fail('could not load the farm-sync modules, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  const reset = () => { try { IA.__setFarmServerArm(null); } catch (e) {} };

  try {
    // ── DORMANT (default): the arm is off, legacy farming is unchanged ────────
    reset();
    if (IA.FARM_SERVER_ARM_ENABLED !== false) fail('FARM_SERVER_ARM_ENABLED must ship false (DORMANT)');
    if (F.isFarmServerArmed()) fail('DORMANT: isFarmServerArmed must be false by default');

    // ── ARM ON (test seam) ────────────────────────────────────────────────────
    if (!IA.__setFarmServerArm(true)) fail('ARM ON: __setFarmServerArm(true) did not arm');
    if (!F.isFarmServerArmed()) fail('ARM ON: farm-sync must see the armed state (shared module instance)');

    // ── THE TRANSPORT BUILDS THE RIGHT RPC CALLS (injected fetch) ─────────────
    {
      const calls = [];
      const fakeFetch = async (url, opt) => {
        calls.push({ url, body: JSON.parse(opt.body), headers: opt.headers });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      };
      const realFetch = globalThis.fetch;
      globalThis.fetch = fakeFetch;
      const cfg = { url: 'https://x.supabase.co', anonKey: 'anon', jwt: 'jwt', slot: 3 };
      try {
        await F.farmPlant(2, 'tomato', { ...cfg, idem: 'idem-p' });
        await F.farmWater(2, { ...cfg, idem: 'idem-w' });
        await F.farmHarvest(2, { ...cfg, idem: 'idem-h' });
        await F.farmUpgradePlot({ ...cfg, idem: 'idem-u' });

        const [p, w, h, u] = calls;
        if (!/\/rest\/v1\/rpc\/hr_farm_plant$/.test(p.url)) fail('plant: wrong endpoint (' + p.url + ')');
        if (p.body.p_slot !== 3 || p.body.p_plot_idx !== 2 || p.body.p_crop !== 'tomato' || p.body.p_idem !== 'idem-p')
          fail('plant: wrong body ' + JSON.stringify(p.body));
        if (p.headers.Authorization !== 'Bearer jwt' || p.headers.apikey !== 'anon') fail('plant: wrong auth headers');
        // No price / yield / xp field may cross the wire — only ids/slot/plot/idem.
        for (const k of Object.keys(p.body)) if (!['p_slot', 'p_plot_idx', 'p_crop', 'p_idem'].includes(k))
          fail('plant: unexpected wire field ' + k);

        if (!/\/rest\/v1\/rpc\/hr_farm_water$/.test(w.url)) fail('water: wrong endpoint');
        if (w.body.p_plot_idx !== 2 || w.body.p_idem !== 'idem-w' || 'p_crop' in w.body)
          fail('water: wrong body ' + JSON.stringify(w.body));

        if (!/\/rest\/v1\/rpc\/hr_farm_harvest$/.test(h.url)) fail('harvest: wrong endpoint');
        if (h.body.p_plot_idx !== 2 || h.body.p_idem !== 'idem-h') fail('harvest: wrong body ' + JSON.stringify(h.body));

        if (!/\/rest\/v1\/rpc\/hr_farm_upgrade_plot$/.test(u.url)) fail('upgrade: wrong endpoint');
        if (u.body.p_slot !== 3 || u.body.p_idem !== 'idem-u' || 'p_plot_idx' in u.body)
          fail('upgrade: wrong body ' + JSON.stringify(u.body));
      } finally {
        globalThis.fetch = realFetch;
      }
    }

    // ── RECONCILE: RENDER THE SERVER RESPONSE INTO G ─────────────────────────
    // A counting deps stub proves produce/XP/seed/deed are applied exactly the
    // server's numbers, exactly once.
    const mkDeps = () => {
      const log = { addItem: [], removeItem: [], addXp: [] };
      return {
        log,
        addItem: (id, q) => log.addItem.push([id, q]),
        removeItem: (id, q) => log.removeItem.push([id, q]),
        addXp: (sk, x) => log.addXp.push([sk, x]),
      };
    };

    // plant → growing plot, seed debited once, plant XP applied
    {
      const G = { farmPlots: [] };
      const d = mkDeps();
      F.reconcileFarmResult(G, 'plant', {
        ok: true, plot: 1, crop: 'tomato', planted_at: '2026-08-22T00:00:00Z',
        seed_spent: 'tomato_seed', plant_xp: 28,
      }, d);
      const pl = G.farmPlots[1];
      if (!pl || pl.cropId !== 'tomato' || pl.state !== 'growing' || pl.regrowCount !== 0)
        fail('reconcile plant: plot not set growing ' + JSON.stringify(pl));
      if (d.log.removeItem.length !== 1 || d.log.removeItem[0][0] !== 'tomato_seed' || d.log.removeItem[0][1] !== 1)
        fail('reconcile plant: seed not debited once ' + JSON.stringify(d.log.removeItem));
      if (d.log.addXp.length !== 1 || d.log.addXp[0][1] !== 28) fail('reconcile plant: plant XP not applied once');
    }

    // water → appended watering, water XP applied
    {
      const G = { farmPlots: [null, { cropId: 'tomato', state: 'growing', waterings: [] }] };
      const d = mkDeps();
      F.reconcileFarmResult(G, 'water', { ok: true, plot: 1, crop: 'tomato', watered_at: '2026-08-22T01:00:00Z', water_xp: 7 }, d);
      if (G.farmPlots[1].waterings.length !== 1) fail('reconcile water: watering not appended');
      if (d.log.addXp.length !== 1 || d.log.addXp[0][1] !== 7) fail('reconcile water: water XP not applied once');
    }

    // harvest (regrow) → produce applied ONCE from the response, plot regrows
    {
      const G = { farmPlots: [null, { cropId: 'tomato', state: 'ready', regrowCount: 0 }] };
      const d = mkDeps();
      F.reconcileFarmResult(G, 'harvest', {
        ok: true, plot: 1, crop: 'tomato', produce: 'tomato', qty: 9, base: 4, perk: 5, xp: 108,
        regrew: true, withered: false, regrows_left: 3,
      }, d);
      if (d.log.addItem.length !== 1 || d.log.addItem[0][0] !== 'tomato' || d.log.addItem[0][1] !== 9)
        fail('reconcile harvest: produce not applied ONCE with the server qty ' + JSON.stringify(d.log.addItem));
      if (d.log.addXp.length !== 1 || d.log.addXp[0][1] !== 108) fail('reconcile harvest: XP not the server figure');
      const pl = G.farmPlots[1];
      if (!pl || pl.state !== 'growing' || pl.regrowCount !== 1) fail('reconcile harvest(regrow): plot not reset growing ' + JSON.stringify(pl));
    }

    // harvest (wither) → plot cleared
    {
      const G = { farmPlots: [null, { cropId: 'tomato', state: 'ready', regrowCount: 4 }] };
      const d = mkDeps();
      F.reconcileFarmResult(G, 'harvest', { ok: true, plot: 1, crop: 'tomato', produce: 'tomato', qty: 5, xp: 60, regrew: false, withered: true }, d);
      if (G.farmPlots[1] !== null) fail('reconcile harvest(wither): plot not cleared');
    }

    // harvest (non-regrow) → plot cleared
    {
      const G = { farmPlots: [{ cropId: 'turnip', state: 'ready' }] };
      const d = mkDeps();
      F.reconcileFarmResult(G, 'harvest', { ok: true, plot: 0, crop: 'turnip', produce: 'turnip', qty: 3, xp: 30, regrew: false, withered: false }, d);
      if (G.farmPlots[0] !== null) fail('reconcile harvest(non-regrow): plot not cleared');
    }

    // upgrade → plot level set, deeds debited from the response
    {
      const G = { plotLevels: 1, farmPlots: [] };
      const d = mkDeps();
      F.reconcileFarmResult(G, 'upgrade', { ok: true, plot_level: 2, deeds_spent: 1 }, d);
      if (G.plotLevels !== 2) fail('reconcile upgrade: plotLevels not set to server value');
      if (d.log.removeItem.length !== 1 || d.log.removeItem[0][0] !== 'farm_deed' || d.log.removeItem[0][1] !== 1)
        fail('reconcile upgrade: deeds not debited once');
    }

    // A non-ok result never mutates G and never throws.
    {
      const G = { farmPlots: [{ cropId: 'tomato', state: 'ready' }] };
      const before = JSON.stringify(G);
      if (F.reconcileFarmResult(G, 'harvest', { ok: false, error: 'not_ready' }, mkDeps()) !== false)
        fail('reconcile: a non-ok result must return false');
      if (JSON.stringify(G) !== before) fail('reconcile: a non-ok result mutated G');
    }

    // ── FAIL-SAFE: an unconfigured / erroring transport never throws ──────────
    {
      // No window, no opts → no config. Must resolve {ok:false}, not throw.
      const r = await F.farmPlant(0, 'turnip', {});
      if (!r || r.ok !== false) fail('unconfigured plant must resolve ok:false (got ' + JSON.stringify(r) + ')');

      const realFetch = globalThis.fetch;
      globalThis.fetch = async () => { throw new Error('boom'); };
      try {
        const r2 = await F.farmHarvest(0, { url: 'https://x.co', anonKey: 'a', jwt: 'j' });
        if (!r2 || r2.ok !== false || r2.error !== 'transport') fail('transport error must resolve ok:false/transport (got ' + JSON.stringify(r2) + ')');
      } finally {
        globalThis.fetch = realFetch;
      }

      const realFetch2 = globalThis.fetch;
      globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
      try {
        const r3 = await F.farmWater(0, { url: 'https://x.co', anonKey: 'a', jwt: 'j' });
        if (!r3 || r3.ok !== false || r3.error !== 'http_429') fail('a 429 must resolve ok:false/http_429 (got ' + JSON.stringify(r3) + ')');
      } finally {
        globalThis.fetch = realFetch2;
      }
    }
  } finally {
    reset();
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await farmSyncGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('farm-sync: dormant no-regression + armed RPC shape + reconcile-from-response (produce once, no double credit) + fail-safe — all green');
}
