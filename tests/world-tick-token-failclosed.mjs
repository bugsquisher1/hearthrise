// ============================================================================
// tests/world-tick-token-failclosed.mjs — THE APPLY REFUSES RATHER THAN LANDING
// A SILENT NO-OP. Security ruling T-1 (P1),
// docs/planning/SEC_WORLD_TICK_TOKEN_2026-09-23.md, on
// supabase/migrations/2026-09-22-world-tick-derived-token.sql.
//
// ── THE DEFECT THIS FILE EXISTS FOR ─────────────────────────────────────────
// Before 2026-09-23 the token migration APPLIED GREEN on a database where
// pgcrypto could not be resolved, and `hr_tick_cron_run` then answered `no_hmac`
// on every fire, for ever. The world tick would have been a permanent no-op with
// a `raise notice` in §5 as the only warning — and CLAUDE.md §4 is explicit that
// a claim is gated on an exit code, never on someone reading a line of output.
// Security confirmed it by execution (arms X-8c/X-8d/X-8e of
// tests/world-tick-token-leak.mjs) and made it a condition of the GO.
//
// ── THE THREE STATES, AND WHY ONLY ONE OF THEM IS NEW ───────────────────────
// `vault.decrypted_secrets` is the discriminator §0b uses, because a database
// that has Supabase's Vault is a database where the derivation is EXPECTED to
// work. That gives three states, and this guard BUILDS all three:
//
//   F-1  no Vault, no pgcrypto   the credential-free replay. Applies, and the
//                                driver fails closed with `no_hmac`. THIS MUST
//                                KEEP WORKING — it is the state every other
//                                db-replay guard and tests/schema-drift.mjs
//                                runs in, and a gate that broke it would have
//                                taken the whole chain with it.
//   F-2  Vault, no pgcrypto      ★ THE APPLY MUST REFUSE. This is T-1. Without
//                                §0b (or, behind it, d10) this arm is the one
//                                that goes red.
//   F-3  Vault + pgcrypto        the production shape. Applies, derives.
//   F-4  pgcrypto, no Vault      the gate must NOT over-fire: a database with
//                                crypto and no Vault is not misconfigured, it
//                                is a replay with a crypto shim, and the driver
//                                answers `no_secret` — a DIFFERENT outcome with
//                                a different operator action, which is the whole
//                                reason `no_hmac` was made its own outcome.
//
// NOTHING IS WRITTEN TO PRODUCTION AND NO CREDENTIAL IS READ. Every arm runs
// against a PGlite database rebuilt from supabase/migrations in
// tests/schema-apply-order.json order. The probe character is a synthetic uuid
// `gen_random_uuid()` cannot mint; the Vault fixture holds a TEST secret.
//
// ── HOW pgcrypto IS PROVIDED WHERE IT IS PROVIDED (stated, not implied) ─────
// PGlite has no pgcrypto — `create extension pgcrypto` answers `extension
// "pgcrypto" is not available`, re-measured by tests/world-tick-token-leak.mjs
// on 0.5.5 / PG 18.3. So F-3 and F-4 borrow that guard's SHIM: RFC 2104 over
// PostgreSQL's core `sha256(bytea)`, which is not a mock of the answer but a
// second implementation of the algorithm, pinned there against node:crypto and
// against the migration's own vector before anything uses it. This file imports
// the shim rather than restating it, so there is exactly one copy to keep true.
//
// Run:  node tests/world-tick-token-failclosed.mjs
//       node tests/world-tick-token-failclosed.mjs --selftest   (mutation proof)
// ============================================================================

import { bootReplay } from './schema-replay.mjs';
import {
  SHIM_CRYPTO, SHIM_VAULT, SHIM_NET, PROBE, K_SECRET, lit,
} from './world-tick-token-shims.mjs';

const TOKEN_FILE = '2026-09-22-world-tick-derived-token.sql';

/* §0b's marker. A distinctive token rather than a prose match, so the arm
   cannot pass on some other raise that happens to mention pgcrypto — and so a
   mutation that turns the gate into a SYNTAX ERROR cannot be scored as "caught"
   (the failure this repo measured on 2026-08-30 and the reason schema-replay's
   patch anchors assert their own arity). */
const T1_MARKER = 'HR_TICK_NO_PGCRYPTO';
const D10_MARKER = 'd10:';

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { console.log(`  ✓ ${name}`); return true; }
  failed += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); return false;
};

/* Apply the whole chain with `seed` injected immediately before the token file,
   and REPORT the apply rather than throwing: whether the file is taken is the
   property under test here, so a refusal is data and not an error. */
async function apply(seed, patch) {
  const opts = {};
  if (seed) { const m = new Map(); m.set(TOKEN_FILE, seed); opts.seedBefore = m; }
  if (patch) { const m = new Map(); m.set(TOKEN_FILE, patch); opts.patches = m; }
  try {
    const { db } = await bootReplay(opts);
    return { applied: true, db, error: null };
  } catch (e) {
    if (e && e.harness) throw e;          // PGlite missing is not a verdict
    const msg = String((e && e.message) || e);
    const first = (e && e.failures && e.failures[0] && e.failures[0].error) || msg;
    return { applied: false, db: null, error: `${first}\n${msg}` };
  }
}

/* Arm the config and lease one synthetic character, so a fire has something to
   roster. Without this the driver answers `empty` and every outcome arm below
   would be measuring nothing. */
async function plantProbe(db) {
  const [{ activity_id }] = (await db.query(
    "select activity_id from public.hr_activities where kind = 'gather' limit 1")).rows;
  await db.exec(`
    insert into auth.users (id) values (${lit(PROBE)}) on conflict do nothing;
    insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version,
                                     accrued_to, active_kind, active_id, active_since)
    values (${lit(PROBE)}, 0, 0, 0, 10, 10, 1, now() - interval '10 minutes', 'gather',
            ${lit(activity_id)}, now() - interval '1 hour')
    on conflict (user_id, slot) do nothing;
    insert into public.hr_tick_ownership (user_id, slot, channel, owned)
    values (${lit(PROBE)}, 0, 'gather', true) on conflict do nothing;
    update public.hr_tick_config set enabled = true,
      edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/'
            || 'hr-accrue-failclosed-probe-does-not-exist' where id;`);
}

const fire = async (db) => (await db.query('select public.hr_tick_cron_run() r')).rows[0].r;

async function main(selftest) {
  console.log('world-tick-token-failclosed — the apply refuses where the tick could not derive\n');

  // ── F-1  THE CREDENTIAL-FREE REPLAY STILL APPLIES, AND STILL FAILS CLOSED ─
  // This arm is first on purpose. §0b is a gate on an apply, and the cheapest
  // way to write a gate is one that refuses everything; the chain every other
  // db-replay guard depends on is the thing that would pay for it.
  console.log('F-1  no Vault, no pgcrypto — the replay chain is untouched');
  {
    const r = await apply(null);
    ok('F-1a the canonical chain still applies end to end', r.applied, r.error);
    if (r.applied) {
      const sch = (await r.db.query('select public.hr_tick_crypto_schema() s')).rows[0].s;
      ok('F-1b ...with pgcrypto genuinely unresolvable (so the arm is not vacuous)',
        sch === null, `crypto_schema=${sch}`);
      await plantProbe(r.db);
      const f = await fire(r.db);
      ok('F-1c the driver refuses `no_hmac` and posts nothing',
        f && f.outcome === 'no_hmac' && f.ok === false, JSON.stringify(f));
      ok('F-1d and it JOURNALS that outcome, the way `no_secret` is journalled',
        (await r.db.query("select count(*)::int n from public.hr_tick_cron_log"
          + " where outcome = 'no_hmac'")).rows[0].n === 1);
      ok('F-1e the hint names the operator action (`create extension`), not the secret',
        (await r.db.query("select detail->>'hint' h from public.hr_tick_cron_log"
          + " where outcome = 'no_hmac' order by id desc limit 1")).rows[0].h
          .includes('pgcrypto'));
    }
  }

  // ── F-2  THE FINDING. Vault present, pgcrypto absent → THE APPLY REFUSES ──
  console.log('\nF-2  ★ Vault, no pgcrypto — the state T-1 named: the apply must REFUSE');
  {
    const r = await apply(SHIM_VAULT);
    ok('F-2a the token migration is REFUSED rather than applied green (T-1)',
      r.applied === false, 'the file applied — the world tick would be a permanent no-op');
    ok('F-2b ...by §0b, naming itself and the fix',
      r.applied === false && r.error.includes(T1_MARKER), r.error && r.error.slice(0, 200));
    ok('F-2c the message tells the operator what to run',
      r.applied === false && /create extension if not exists pgcrypto/.test(r.error));
    ok('F-2d and it does NOT leak the Vault secret into the apply output',
      r.applied === false && !r.error.includes(K_SECRET));
  }

  // ── F-3  THE PRODUCTION SHAPE. Both present → the file is taken, and derives.
  console.log('\nF-3  Vault + pgcrypto — the gate lets the state it exists to protect through');
  {
    const r = await apply(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
    ok('F-3a the token migration applies', r.applied, r.error);
    if (r.applied) {
      ok('F-3b pgcrypto resolves, and to the schema pgcrypto ships in on Supabase',
        (await r.db.query('select public.hr_tick_crypto_schema() s')).rows[0].s === 'extensions');
      await plantProbe(r.db);
      const f = await fire(r.db);
      ok('F-3c and a fire reaches `posted` — the gate cost the working state nothing',
        f && f.outcome === 'posted' && f.auth === 'v1', JSON.stringify(f));
    }
  }

  // ── F-4  THE OVER-FIRE CHECK, and the reason `no_hmac` is its own outcome ──
  console.log('\nF-4  pgcrypto but no Vault — a different failure with a different fix');
  {
    const r = await apply(SHIM_CRYPTO + SHIM_NET);
    ok('F-4a the apply is NOT refused: no Vault means no expectation to derive', r.applied, r.error);
    if (r.applied) {
      await plantProbe(r.db);
      const f = await fire(r.db);
      ok('F-4b the driver answers `no_secret`, NOT `no_hmac` — the operator action is a '
        + 'Vault write, and an outcome that conflated the two would send them to the wrong fix',
        f && f.outcome === 'no_secret', JSON.stringify(f));
      ok('F-4c and it still posts nothing', f && f.ok === false);
    }
  }

  if (!selftest) return;

  // ── MUTATIONS ────────────────────────────────────────────────────────────
  // §0b and d10 are the SAME predicate read from opposite ends of the file, so
  // the interesting mutations are the ones that remove them one at a time: each
  // must still be caught by the other, and only removing BOTH may reproduce
  // T-1. An expectation per mutation, rather than one blanket rule, is what
  // makes that distinction measurable instead of asserted.
  console.log('\n--selftest  §0b and d10 removed, singly and together');
  const NOTICE_0B = [
    "  if to_regclass('vault.decrypted_secrets') is not null\n"
    + "     and public.hr_tick_crypto_schema() is null then\n    raise exception",
    "  if to_regclass('vault.decrypted_secrets') is not null\n"
    + "     and public.hr_tick_crypto_schema() is null then\n    raise notice",
  ];
  const NOTICE_D10 = [
    "      raise exception 'd10: pgcrypto is unreachable on a database that has Vault, and the '",
    "      raise notice 'd10: pgcrypto is unreachable on a database that has Vault, and the '",
  ];
  const mutations = [
    ['MF1 §0b downgraded to a `raise notice` (the review\'s exact wording for T-1)',
      [NOTICE_0B], 'refused', D10_MARKER,
      'd10 — the backstop at the far end of §5 still refuses the apply'],
    ['MF2 d10 downgraded to a `raise notice`',
      [NOTICE_D10], 'refused', T1_MARKER,
      '§0b — the gate at the top still refuses the apply'],
    ['MF3 BOTH gates downgraded — T-1 itself, reproduced',
      [NOTICE_0B, NOTICE_D10], 'applied', null,
      'F-2a — the file applies green and the tick is a permanent no-op, which is '
      + 'the defect exactly; F-2a is the arm that goes red'],
  ];
  let caught = 0;
  for (const [name, patch, expect, marker, by] of mutations) {
    let verdict = null;
    try {
      const r = await apply(SHIM_VAULT, patch);
      if (expect === 'refused') {
        if (r.applied) verdict = 'THE APPLY SUCCEEDED — the remaining gate did not bite';
        else if (!r.error.includes(marker)) {
          // A mutation that lands as a syntax error refuses the apply for the
          // wrong reason and would score as a pass. The marker is what tells
          // the two apart.
          verdict = `refused, but not by the expected gate: ${r.error.split('\n')[0].slice(0, 120)}`;
        }
      } else if (!r.applied) {
        verdict = `the apply was still refused: ${r.error.split('\n')[0].slice(0, 120)}`;
      }
    } catch (e) { verdict = `harness: ${String((e && e.message) || e).split('\n')[0]}`; }
    if (verdict === null) { caught += 1; console.log(`  ✓ ${name}\n      as expected (${expect}) — ${by}`); }
    else { failed += 1; console.log(`  ✗ ${name}\n      ${verdict}`); }
  }
  console.log(`\n  ${caught}/${mutations.length} mutations behaved as the rule predicts`);
}

main(process.argv.includes('--selftest')).then(() => {
  if (failed) {
    console.log(`\nworld-tick-token-failclosed: RED — ${failed} arm(s) failed.`);
    process.exit(1);
  }
  console.log('\nworld-tick-token-failclosed: green — a database that has Vault and cannot'
    + '\n  resolve pgcrypto REFUSES the file, the credential-free replay still applies and'
    + '\n  still fails closed, and the working state paid nothing for the gate.');
}).catch((e) => {
  console.error(`\nworld-tick-token-failclosed: HARNESS ERROR — ${(e && e.message) || e}`);
  process.exit(2);
});
