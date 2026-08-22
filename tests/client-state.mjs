// ============================================================================
// tests/client-state.mjs — THE CLIENT_STATE HOME, PROVEN BOTH WAYS.
//
// Server-side correctness of hr_put_client_state / the client_state projection
// is proven by the §6 self-check inside 2026-08-28-client-state.sql (it runs on
// every apply: shallow merge, idempotent replay, bad/oversized patch refused,
// hr_state_of projects it, no client write policy on player_state). This is the
// CLIENT half: that src/net/client-state.js reads residue from the server
// envelope under arm, falls through to the blob while DORMANT (no regression),
// and that putClientState builds the right RPC call.
//
// Run standalone:  node tests/client-state.mjs
// Wired into the suite as a preflight (clientStateGuard).
// ============================================================================
const ROOT = new URL('../', import.meta.url);
const mod = (p) => new URL(p, ROOT).href;

export async function clientStateGuard() {
  const problems = [];
  const fail = (m) => problems.push('client-state: ' + m);

  let C, A;
  try {
    // ⚠ MATCH THE SPECIFIERS client-state.js USES (it imports ./accrue.js?v=NNN).
    // Derive the CURRENT ?v= from client-state.js's OWN source so the test can
    // never drift out of lockstep with a version bump — the b436 breakage.
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('src/net/client-state.js', ROOT), 'utf8');
    const m = src.match(/accrue\.js\?v=(\d+)/);
    const v = m ? `?v=${m[1]}` : '';
    C = await import(mod('src/net/client-state.js'));
    A = await import(mod('src/net/accrue.js' + v));
  } catch (e) {
    fail('could not load the client-state modules, so NOTHING below ran: ' + (e && e.message));
    return problems;
  }

  const reset = () => {
    try { C.__setClientStateArm(null); } catch (e) {}
    try { C.__resetClientState(); } catch (e) {}
    try { A.setServerAccrualEnabled(false); } catch (e) {}
  };

  try {
    // ── ARM OFF (default): dormant, no regression ──────────────────────────
    reset();
    if (C.CLIENT_STATE_SERVER_BACKED !== false) fail('CLIENT_STATE_SERVER_BACKED must ship false (DORMANT)');
    if (C.isClientStateServerBacked()) fail('ARM OFF: isClientStateServerBacked must be false');
    {
      const G = { stats: { kills: 7 }, activeStyle: 2, foodSlot: 'shrimp',
                  bountyHunter: { xp: 50, board: [] } };
      // Even with a server bag loaded, dormant reads MUST come from the blob.
      C.applyClientState({ ok: true, client_state: { activeStyle: 99, foodSlot: 'lobster' } });
      if (C.clientField(G, 'activeStyle') !== 2) fail('ARM OFF: activeStyle must read the blob (2), not the server bag');
      if (C.clientField(G, 'foodSlot') !== 'shrimp') fail('ARM OFF: foodSlot must read the blob');
      if (C.clientField(G, 'stats').kills !== 7) fail('ARM OFF: stats must read the blob');
      if (C.clientField(G, 'missing', 'DEF') !== 'DEF') fail('ARM OFF: absent field must yield the fallback');
      if (C.isClientStateFromServer()) fail('ARM OFF: isClientStateFromServer must be false');
    }

    // ── ARM ON: residue is sourced from the server envelope ────────────────
    // The arm ALSO requires the master accrual switch (isServerAccrualEnabled).
    C.__resetClientState();
    A.setServerAccrualEnabled(true);
    const armed = C.__setClientStateArm(true);
    if (!armed) { fail('ARM ON: could not arm (master switch not honoured?) — rest skipped'); reset(); return problems; }
    {
      const G = { activeStyle: 2, foodSlot: 'shrimp', stats: { kills: 7 } };   // a forged blob must NOT be read
      // Before any envelope: no bag → fields read as fallback, and NOT from the blob.
      if (C.clientField(G, 'activeStyle', 'NONE') !== 'NONE')
        fail('ARM ON: before an envelope, a blob value leaked through instead of the fallback');
      if (C.isClientStateFromServer()) fail('ARM ON: from-server must be false before an envelope');

      // Apply a server envelope → residue comes from client_state.
      const ok = C.applyClientState({ ok: true, version: 5, now: Date.now(),
        client_state: { activeStyle: 3, foodSlot: 'lobster', stats: { kills: 42 },
                        bountyHunter: { xp: 900 } } });
      if (!ok) fail('ARM ON: applyClientState rejected a valid envelope');
      if (!C.isClientStateFromServer()) fail('ARM ON: from-server must be true after an envelope');
      if (C.clientField(G, 'activeStyle') !== 3) fail('ARM ON: activeStyle must be the server value (3), not the blob (2)');
      if (C.clientField(G, 'foodSlot') !== 'lobster') fail('ARM ON: foodSlot must be the server value');
      if (C.clientField(G, 'stats').kills !== 42) fail('ARM ON: stats must be the server value');
      if (C.clientField(G, 'bountyHunter').xp !== 900) fail('ARM ON: bountyHunter must be the server value');
      // A key the server never supplied yields the fallback, never the blob.
      if (C.clientField(G, 'chronicle', 'EMPTY') !== 'EMPTY')
        fail('ARM ON: a server-absent key must yield the fallback, not the blob value');
    }

    // A malformed / absent client_state does not corrupt the store.
    {
      if (C.applyClientState({ ok: true, client_state: [1, 2] })) fail('ARM ON: an array client_state must be rejected');
      if (C.applyClientState({ ok: false, client_state: {} })) fail('ARM ON: a non-ok envelope must be rejected');
      // the previous good bag survives a rejected envelope
      const G = {};
      if (C.clientField(G, 'activeStyle') !== 3) fail('ARM ON: a rejected envelope clobbered the last good bag');
    }

    // ── putClientState builds the correct RPC call (injected transport) ────
    {
      let captured = null;
      const fakeFetch = async (url, opt) => {
        captured = { url, opt, body: JSON.parse(opt.body) };
        return { ok: true, status: 200, json: async () => ({ ok: true, slot: 0, bytes: 12 }) };
      };
      const realFetch = globalThis.fetch;
      globalThis.fetch = fakeFetch;
      try {
        const r = await C.putClientState({ activeStyle: 4 }, {
          url: 'https://x.supabase.co', anonKey: 'anon', jwt: 'jwt', slot: 0, idem: 'idem-1',
        });
        if (!r || r.ok !== true) fail('putClientState: expected ok:true from the stub (' + JSON.stringify(r) + ')');
        if (!captured || !/\/rest\/v1\/rpc\/hr_put_client_state$/.test(captured.url))
          fail('putClientState: wrong endpoint (' + (captured && captured.url) + ')');
        if (captured.body.p_patch.activeStyle !== 4 || captured.body.p_slot !== 0 || captured.body.p_idem !== 'idem-1')
          fail('putClientState: wrong body (' + JSON.stringify(captured && captured.body) + ')');
        if (captured.opt.headers.Authorization !== 'Bearer jwt') fail('putClientState: missing JWT');
        // guards: bad patch + missing config are non-fatal, never throw.
        const bad = await C.putClientState([1], { url: 'u', anonKey: 'a', jwt: 'j' });
        if (bad.ok !== false || bad.error !== 'bad_patch') fail('putClientState: array patch must be refused');
        const unconf = await C.putClientState({ a: 1 }, {});
        if (unconf.ok !== false || unconf.error !== 'not_configured') fail('putClientState: missing config must be refused');
      } finally {
        globalThis.fetch = realFetch;
      }
    }
  } finally {
    reset();
  }

  return problems;
}

const SELF = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (SELF) {
  const probs = await clientStateGuard();
  if (probs.length) { console.error('FAIL:\n' + probs.map((p) => '  - ' + p).join('\n')); process.exit(1); }
  console.log('client-state: dormant no-regression (blob) + armed server-read + putClientState builds the RPC — all green');
}
