#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/renown-projection.mjs — THE SERVER'S COUNTED RENOWN MUST REACH THE
//                               HEADLINE, AND IT MUST BE THE SERVER'S NUMBER.
//
//   node tests/renown-projection.mjs             # the guard
//   node tests/renown-projection.mjs --selftest  # every mutation must turn it RED
//
// Ships with: supabase/migrations/2026-09-12-renown-high-projection.sql
//
// ── THE BUG IT CLOSES ───────────────────────────────────────────────────────
// b535 pointed the renown headline and the rank-up card at a SERVER mirror
// (src/features/renown.js `noteServerRenown` / `serverRenownHigh`). hr_state_of
// projected no renown, so the mirror's only continuously-available source was
// the `renown_claim:<rank>` once-guard flag — the threshold of the last rank the
// player PAID for. Measured live 2026-09-11: the QA account's headline read 400
// (the Serf floor) while the server had counted 779 toward Squire (900). The one
// thing that moves the number is clicking Claim, so the display was dark exactly
// where progress happens.
//
// ── WHAT THIS GUARD DRIVES (no credentials, real PostgreSQL) ────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite, then a real character through the REAL verbs:
//
//   server-simulated kills + skills  →  hr_apply RATCHETS player_state.renown_high
//     →  hr_state_of PROJECTS it top-level                        (real SQL)
//       →  src/features/renown.js noteServerRenown reads THAT envelope
//          and serverRenownHigh() returns the server's figure      (real client)
//         →  hr_claim_rank__ungated's verdict carries the SAME figure (AGREEMENT)
//
// The agreement check is the one that matters. A projection the claim path does
// not honour is worse than no projection: the player reads 900, clicks Claim and
// is told `not_reached`. So R3 requires the envelope's number and the claim
// verdict's number to be equal, not merely both present.
//
// ── WHY R1 IS FIRST ─────────────────────────────────────────────────────────
// R4 and R5 are assertions that a number did NOT move. All of them pass
// trivially if the projection is broken to always return 0 — the class of "fix"
// that looks green and deletes a progression system. R1 therefore requires the
// projected figure to EQUAL hr_renown_of and to be strictly positive first; only
// then do the did-not-move checks mean anything. `--mutate` proves which check
// catches which defect.
//
// Exit: 0 green · 1 a real problem · 2 harness problem.
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { bootReplay } from './schema-replay.mjs';

const ROOT = new URL('../', import.meta.url);
const MIG = '2026-09-12-renown-high-projection.sql';
const UID = '000000d8-0000-0000-0000-0000000000d8';

/* ── THE GATE-BLIND PAIR ───────────────────────────────────────────────────
   Every mutation is ALSO run with the migration's own §3 commit gate short-
   circuited. A tick that only means "the apply threw" proves the MIGRATION can
   fail, not that THIS GUARD can see anything — and §3 fires once, at apply time.
   The regression that actually brings the bug back is a LATER migration
   restating hr_state_of or hr_apply from a stale template, at which point §3
   never runs again and this file is the only thing left standing. */
const GATE_BLIND = [
  `  raise notice 'renown-high-projection: hr_apply ratchets renown_high from hr_renown_of, hr_state_of '
               'projects it top-level, the claim verdict and the envelope agree, a client kill '
               'credit moves nothing, the high-water never falls, nothing became client-executable '
               '— all green';
end $$;`,
  `  null;
exception when others then
  raise notice 'Sec 3 SHORT-CIRCUITED FOR THE MUTATION PROOF: %', sqlerrm;
end $$;`,
];

/* The anchor text both ratchet mutations rewrite, quoted from the migration. */
const RATCHET = `    update public.player_state
       set renown_high = greatest(coalesce(renown_high, 0),
                                  coalesce(public.hr_renown_of(v_uid, v_slot), 0))
     where user_id = v_uid and slot = v_slot;`;

/* ── MUTATIONS ─────────────────────────────────────────────────────────────
   Each plants a REAL defect a future edit could reintroduce, into the REAL
   migration text, and must turn THIS guard red. `why` names the defect; `by`
   names the assertion that is supposed to catch it, so a mutation cannot pass
   for the wrong reason. */
const MUTATIONS = {
  projection_key_renamed: {
    by: 'R2',
    why: 'THE SHIPPED BUG, restored under a new name: hr_state_of projects the figure under a key '
       + 'src/features/renown.js does not read, so the headline falls back to the last PAID rank\'s '
       + 'threshold. (A RENAME rather than a deletion — deleting the line leaves the spliced string '
       + 'literal unbalanced, and a syntax error is a harness failure dressed up as a catch.)',
    find: `    'renown_high', coalesce(v_st.renown_high, 0),$new$);`,
    repl: `    'renownHigh', coalesce(v_st.renown_high, 0),$new$);`,
  },
  projection_nested_in_state: {
    by: 'R2',
    why: 'the key is projected but INSIDE `state` instead of top-level, where the claim verdict also '
       + 'lives. Every "does hr_state_of mention renown_high" check still passes and the client '
       + 'reader — which takes `res.renown_high` — sees nothing',
    find: `  c_anchor constant text := $anc$'total_level', public.hr_total_level(p_user, v_st.slot),$anc$;`,
    repl: `  c_anchor constant text := $anc$'streak_days', v_st.streak_days,$anc$;`,
  },
  ratchet_removed: {
    by: 'R1',
    why: 'the hr_apply splice stops ratcheting, so the cached column only ever moves when a player '
       + 'clicks Claim — the projection is honest and permanently stale, which is the original bug '
       + 'with an extra key on the envelope',
    find: RATCHET,
    repl: '    null;',
  },
  ratchet_reads_client_counter: {
    by: 'R1',
    why: 'the high-water is sourced from the raw lifetime kill counter instead of hr_renown_of — a '
       + 'number hr_credit_kills writes on a CLIENT claim. The cached figure stops being the score '
       + 'the claim path decides on, and client-credited kills start buying rank',
    find: RATCHET,
    repl: `    update public.player_state
       set renown_high = greatest(coalesce(renown_high, 0),
                                  coalesce((select value from public.player_progress
                                             where user_id = v_uid and slot = v_slot
                                               and kind = 'stat' and period_key = ''
                                               and key = 'ev:kill_any'), 0))
     where user_id = v_uid and slot = v_slot;`,
  },
  ratchet_banks_credited_kills: {
    by: 'R4',
    why: 'the ratchet adds the client-credited kill count back on top of the discounted score. The '
       + 'first settle still matches (nothing credited yet), so only the credit test sees it — and '
       + 'because the column is a HIGH-WATER, a forged credit banked once is banked forever',
    find: RATCHET,
    repl: `    update public.player_state
       set renown_high = greatest(coalesce(renown_high, 0),
                                  coalesce(public.hr_renown_of(v_uid, v_slot), 0)
                                  + coalesce((select value from public.player_progress
                                               where user_id = v_uid and slot = v_slot
                                                 and kind = 'stat' and period_key = ''
                                                 and key = 'ev:kill_credited_any'), 0))
     where user_id = v_uid and slot = v_slot;`,
  },
  ratchet_not_monotonic: {
    by: 'R5',
    why: 'greatest() is dropped, so the cached figure follows the LIVE score down. Spending gold or '
       + 'breaking a streak would then DEMOTE a rank the player earned — the exact failure '
       + '2026-08-22-renown-claim.sql added the high-water to prevent',
    find: RATCHET,
    repl: `    update public.player_state
       set renown_high = coalesce(public.hr_renown_of(v_uid, v_slot), 0)
     where user_id = v_uid and slot = v_slot;`,
  },
};

/* The NEGATIVE CONTROL. A comment-only edit is not a defect; if the guard goes
   red on it, its assertions are reading text rather than behaviour and every
   tick above is worthless. */
const NEGATIVE_CONTROL = {
  find: '-- ── 3. SELF-VERIFYING COMMIT GATE (§4) ─────────────────────────────────────',
  repl: '-- ── 3. SELF-VERIFYING COMMIT GATE (§4) — comment-only negative control ─────',
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

async function boot(mutate, gateBlind, extra) {
  const pairs = [];
  if (mutate) pairs.push([MUTATIONS[mutate].find, MUTATIONS[mutate].repl]);
  if (extra) pairs.push([extra.find, extra.repl]);
  if (gateBlind) pairs.push(GATE_BLIND);
  if (!pairs.length) { const { db } = await bootReplay(); return db; }
  const { db } = await bootReplay({ patches: new Map([[MIG, pairs]]) });
  return db;
}

/* ── THE REAL CLIENT READER ────────────────────────────────────────────────
   src/features/renown.js is a classic script (window.HearthriseRenown), so it is
   evaluated with the four globals it touches at load. Loading the REAL file is
   the point: a guard that re-implements `pickServerRenown` would agree with
   itself while the shipped reader looked at a key nobody projects. */
async function loadRenownReader() {
  const src = await readFile(new URL('src/features/renown.js', ROOT), 'utf8');
  const win = {};
  const stub = {
    window: win,
    document: { readyState: 'complete', addEventListener() {} },
    setTimeout: () => 0,
    setInterval: () => 0,
    clearInterval: () => {},
    console: { log() {}, warn() {}, error() {} },
  };
  // eslint-disable-next-line no-new-func
  new Function(...Object.keys(stub), src)(...Object.values(stub));
  const R = win.HearthriseRenown;
  if (!R || typeof R.noteServerRenown !== 'function' || typeof R.serverRenownHigh !== 'function') {
    const e = new Error('src/features/renown.js did not expose noteServerRenown/serverRenownHigh — '
      + 'the CLIENT half of this guard cannot run and a pass would be meaningless');
    e.harness = true; throw e;
  }
  return R;
}

const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

async function runAll(db) {
  const R = await loadRenownReader();

  // ── R0. NOTHING BECAME CLIENT-REACHABLE ─────────────────────────────────
  // renown_high is the rank authority and hr_renown_of takes an ARBITRARY uuid.
  for (const [fn, sig] of [
    ['hr_renown_of', 'public.hr_renown_of(uuid,int)'],
    ['hr_state_of', 'public.hr_state_of(uuid,int)'],
    ['hr_apply', 'public.hr_apply(uuid,int,bigint,uuid,jsonb)'],
  ]) {
    for (const role of ['anon', 'authenticated', 'service_role']) {
      const r = await one(db, `select has_function_privilege($1, $2, 'execute') as p`, [role, sig]);
      ok(r.p === false, `${fn} is NOT executable by ${role}`);
    }
    const e = await one(db, `select has_function_privilege('hr_engine', $1, 'execute') as p`, [sig]);
    ok(e.p === true, `${fn} IS executable by hr_engine (the engine path is alive)`);
  }

  // ── THE FIXTURE. Every number below is read back from the server. ────────
  await db.exec(`insert into auth.users (id) values ('${UID}') on conflict (id) do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, version, renown_high, accrued_to)
                 values ('${UID}', 0, 0, 0, 1, 0, now() - interval '60 minutes')
                 on conflict (user_id, slot) do update
                   set gold = 0, version = 1, renown_high = 0;`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${UID}', false)`);

  // A FRESH CHARACTER STATES ZERO — present, never null, never absent. `absent`
  // means "the realm said nothing" to the client reader, which is a different
  // claim from "you have nothing".
  {
    const env = (await one(db, `select public.hr_state_of($1::uuid, 0) as e`, [UID])).e;
    ok(Object.prototype.hasOwnProperty.call(env, 'renown_high'),
       'a fresh character\'s envelope CARRIES the renown_high key');
    ok(Number(env.renown_high) === 0,
       `a fresh character projects 0 (got ${JSON.stringify(env.renown_high)})`);
    R.__resetClaimState();
    const noted = R.noteServerRenown(env);
    ok(noted && noted.mode === 'server' && R.serverRenownHigh() === 0,
       `the client reader accepts the zero as a STATEMENT, not as silence (got ${JSON.stringify(noted)})`);
  }

  // A real is_boss monster the renown boss term actually scores, and the real
  // combat levels hr_credit_kills prices its physical cap from.
  const boss = (await one(db, `select m.monster_id as id from public.hr_bounty_monsters m
      join public.hr_activities a on a.kind = 'combat' and a.is_boss and a.activity_id = m.monster_id
     order by m.monster_id limit 1`)).id;
  ok(!!boss, 'the catalogue has a bounty-eligible is_boss monster (the fixture needs one)');
  await db.exec(`insert into public.player_skills (user_id, slot, skill_id, xp)
                 select '${UID}', 0, s, 13034431
                   from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
                 on conflict (user_id, slot, skill_id) do update set xp = 13034431;`);
  await db.exec(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
                 values ('${UID}', 0, 'stat', 'ev:kill_monster:${boss}', 100, '', 'active'),
                        ('${UID}', 0, 'stat', 'ev:kill_any', 100, '', 'active')
                 on conflict (user_id, slot, kind, key, period_key)
                   do update set value = public.player_progress.value + excluded.value;`);
  await db.exec(`update public.player_state set active_kind = 'combat', active_id = '${boss}',
                   active_since = now() - interval '60 minutes'
                  where user_id = '${UID}' and slot = 0;`);

  const apply = async (delta) => {
    const v = (await one(db, `select version from public.player_state where user_id=$1 and slot=0`, [UID])).version;
    return (await one(db,
      `select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text::jsonb) as r`,
      [UID, v, JSON.stringify({ ...delta, journal: { kind: 'admin', intent: 'renown-projection:probe' } })])).r;
  };
  const score = async () =>
    Number((await one(db, `select public.hr_renown_of($1::uuid, 0) as s`, [UID])).s);
  const projected = async () =>
    Number(((await one(db, `select public.hr_state_of($1::uuid, 0) as e`, [UID])).e || {}).renown_high);

  // ── R1. THE HONEST CONTROL — the settle BANKS the server's own score ─────
  ok((await projected()) === 0, 'the fixture starts with the column still at 0 (the ratchet is what moves it)');
  const r1 = await apply({ gold: 2000 });
  ok(r1 && r1.ok === true, `the probe apply succeeded (got ${JSON.stringify(r1 && r1.error)})`);
  const live1 = await score();
  ok(live1 > 0, `the seeded character scores a POSITIVE renown (${live1}) — otherwise every `
     + '"did not move" check below passes for the wrong reason');
  const proj1 = Number(r1 && r1.renown_high);
  ok(proj1 === live1, `the apply's OWN response projects the live score (${proj1} vs hr_renown_of ${live1}) `
     + '— the settle is never one tick stale');
  ok((await projected()) === live1,
     `a fresh hr_state_of read projects the same figure (${await projected()} vs ${live1})`);

  // ── R2. THE CLIENT READER LEARNS IT — the real shipped reader, real envelope ──
  {
    const env = (await one(db, `select public.hr_state_of($1::uuid, 0) as e`, [UID])).e;
    R.__resetClaimState();
    const noted = R.noteServerRenown(env);
    ok(noted && noted.mode === 'server' && noted.raised === true,
       `noteServerRenown reads the envelope as a SERVER statement (got ${JSON.stringify(noted)})`);
    ok(R.serverRenownHigh() === live1,
       `serverRenownHigh() is the server's figure ${live1} after a plain envelope (got ${R.serverRenownHigh()}) `
       + '— this is the headline the player reads after a reload');
  }

  // ── R3. THE CLAIM PATH AGREES ───────────────────────────────────────────
  ok(live1 >= 400, `the fixture clears the serf threshold (${live1} >= 400) so the agreement check can run`);
  const claim = (await one(db, `select public.hr_claim_rank__ungated('serf', 0) as r`)).r;
  ok(claim && claim.ok === true, `serf claimed at a projected ${live1} (got ${JSON.stringify(claim && claim.error)})`);
  ok(Number(claim && claim.renown_high) === proj1,
     `the claim verdict's renown_high (${claim && claim.renown_high}) EQUALS the projected figure (${proj1}) `
     + '— the headline can never promise a rank the claim then refuses');

  // ── R4. A CLIENT KILL CREDIT MOVES NOTHING ──────────────────────────────
  // The real bounty verbs, against the real boss. This is the property that
  // makes caching the score safe: an undiscounted cache would turn the
  // 2026-09-02 faucet from a self-correcting over-count into a permanent one.
  const acc = (await one(db,
    `select public.hr_accept_bounty__ungated(0, 'rpg', $1, 'cull', 'normal', 100) as r`, [boss])).r;
  ok(acc && acc.ok === true, `the fixture accepted a bounty on ${boss} (got ${JSON.stringify(acc && acc.error)})`);
  await db.exec(`update public.active_bounty set accepted_at = now() - interval '60 minutes'
                  where user_id = '${UID}' and slot = 0;`);
  const cred = (await one(db,
    `select public.hr_credit_kills__ungated(0, $1, 400, 'rpg-idem-1') as r`, [boss])).r;
  ok(cred && cred.ok === true, `the client kill credit was accepted (got ${JSON.stringify(cred && cred.error)})`);
  ok(Number(cred && cred.credited) > 0,
     `the credit applied ${cred && cred.credited} kills — a zero credit would make this check vacuous`);
  ok((await projected()) === proj1,
     `the credit alone did not move the projection (${await projected()} vs ${proj1})`);
  const r4 = await apply({});
  ok(r4 && r4.ok === true, `the post-credit apply succeeded (got ${JSON.stringify(r4 && r4.error)})`);
  ok(Number(r4 && r4.renown_high) === proj1,
     `the RATCHET did not bank the client credit of ${cred && cred.credited} kills `
     + `(${r4 && r4.renown_high} vs ${proj1})`);

  // ── R5. MONOTONIC ───────────────────────────────────────────────────────
  // Spend the gold — goldLog is the term that really falls — and settle again.
  await db.exec(`update public.player_state set gold = 0 where user_id = '${UID}' and slot = 0;`);
  const liveLow = await score();
  ok(liveLow < proj1, `the fixture is NON-VACUOUS: spending the gold lowered the LIVE score to ${liveLow}, `
     + `below the banked ${proj1}`);
  const r5 = await apply({});
  ok(r5 && r5.ok === true, `the post-spend apply succeeded (got ${JSON.stringify(r5 && r5.error)})`);
  ok(Number(r5 && r5.renown_high) >= proj1,
     `the high-water did NOT fall with the live score (${r5 && r5.renown_high} vs banked ${proj1})`);
  {
    const env = (await one(db, `select public.hr_state_of($1::uuid, 0) as e`, [UID])).e;
    R.__resetClaimState();
    R.noteServerRenown(env);
    ok(R.serverRenownHigh() >= proj1,
       `the headline still reads the banked figure after the spend (got ${R.serverRenownHigh()})`);
  }

  // ── R6. THE FILE RE-APPLIES BYTE-IDENTICALLY ────────────────────────────
  // A migration the Coordinator can only run once is a migration that cannot be
  // replayed into a restored database. Both splices must detect their own work
  // and return, leaving the two bodies unchanged to the byte.
  {
    const bodies = async () => (await db.query(
      `select pg_get_functiondef('public.hr_state_of(uuid,int)'::regprocedure) as s,
              pg_get_functiondef('public.hr_apply(uuid,int,bigint,uuid,jsonb)'::regprocedure) as a`)).rows[0];
    const before = await bodies();
    let reapplied = true;
    try {
      const sql = (await readFile(new URL(`supabase/migrations/${MIG}`, ROOT), 'utf8')).replace(/\r\n/g, '\n');
      await db.exec(sql);
    } catch (e) { reapplied = false; ok(false, `the migration did not re-apply: ${e && e.message}`); }
    if (reapplied) {
      const after = await bodies();
      ok(after.s === before.s, 'a second apply leaves hr_state_of byte-identical');
      ok(after.a === before.a, 'a second apply leaves hr_apply byte-identical');
    }
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  for (const [k, m] of Object.entries(MUTATIONS)) console.log(`${k}  [caught by ${m.by}]\n    ${m.why}\n`);
  console.log('negative control: comment-only edit (must NOT be caught)');
  process.exit(0);
}

const only = (argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
if (only) {
  if (!MUTATIONS[only]) { console.error(`unknown mutation "${only}" — see --list`); process.exit(2); }
  const gateBlind = argv.includes('--gate-blind');
  try { const db = await boot(only, gateBlind); await runAll(db); }
  catch (e) { console.log(`${only}: RED (threw: ${String(e.message).split('\n')[0]})`); process.exit(0); }
  console.log(`${only}${gateBlind ? ' [gate-blind]' : ''}: ${failed ? `RED (${failed} assertion(s))` : 'GREEN'}`);
  process.exit(0);
}

if (argv.includes('--selftest')) {
  console.log('renown-projection --selftest: each mutation must turn the guard RED');
  {
    const save = failed; failed = 0;
    const db = await boot(null); await runAll(db);
    if (failed) { console.error(`\nFLOOR CHECK FAILED: the CLEAN pass is already red (${failed}).`); process.exit(2); }
    failed = save;
  }
  let bad = 0, n = 0;
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
        console.error(`  x ${label}: the §3 short-circuit did NOT take (the apply still threw), so this arm `
          + "demonstrated the MIGRATION's gate again rather than the guard. Fix GATE_BLIND.");
        continue;
      }
      if (wentRed) { if (!threw) console.log(`  ${label}: RED (assertions failed) — caught by ${MUTATIONS[name].by}`); }
      else { bad++; console.error(`  x ${label}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
    }
  }
  // THE NEGATIVE CONTROL — a comment-only edit must leave the guard green.
  {
    n++;
    const saveFail = failed; failed = 0; let threw = false;
    try { const db = await boot(null, false, NEGATIVE_CONTROL); await runAll(db); }
    catch (e) { threw = true; console.error(`  x negative control THREW: ${e && e.message}`); }
    const wentRed = failed > 0 || threw; failed = saveFail;
    if (wentRed) { bad++; console.error('  x negative control: a COMMENT-ONLY edit turned the guard red — '
      + 'its assertions read text, not behaviour, and every tick above is worthless'); }
    else console.log('  negative control (comment-only): GREEN, as required');
  }
  if (bad) { console.error(`\n${bad} mutation arm(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${n} arms behaved (${Object.keys(MUTATIONS).length} defects x gate / gate-blind, `
    + 'plus one negative control). The guard is non-vacuous in its own right.');
  process.exit(0);
}

try {
  const db = await boot(null);
  await runAll(db);
} catch (e) {
  if (e && e.harness) { console.error(`renown-projection HARNESS: ${e.message}`); process.exit(2); }
  throw e;
}
if (failed) { console.error(`\nrenown-projection: ${failed} assertion(s) FAILED.`); process.exit(1); }
console.log('renown-projection: hr_apply ratchets player_state.renown_high from hr_renown_of, hr_state_of '
  + 'projects it top-level, the shipped client reader learns the server\'s figure off a plain envelope, '
  + 'the claim verdict agrees with it, a client kill credit moves it by zero, and it never falls.');
process.exit(0);
