#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/intent-mismatch.mjs — ONE IDEMPOTENCY KEY, ONE INTENT.
//                             GRADED AGAINST REAL POSTGRESQL.
//
//   node tests/intent-mismatch.mjs             # the guard
//   node tests/intent-mismatch.mjs --list      # the mutation catalogue
//   node tests/intent-mismatch.mjs --selftest  # every mutation must be CAUGHT
//   node tests/intent-mismatch.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-03-intent-mismatch-class.sql
//
// ── THE DEFECT (b493/b494 security pass, finding #7, P3) ────────────────
// `player_intents` is ONE namespace keyed on (user_id, intent_id). hr_apply has
// compared the stored `intent` and `slot` before serving a cached envelope since
// apply-engine §S6; TWELVE other SECURITY DEFINER RPCs read the same cache and
// compare neither, so a uuid claimed by ANY verb answers for EVERY verb. The
// headline probe here is the money case: burn a key on `client_state_put` (a
// trivially callable, free verb), then present it to `hr_claim_goal` with a
// COMPLETE daily. Unpatched, the claim answers `ok:true` with the client-state
// verb's envelope, pays nothing, and the player's completed goal is spent.
//
// Self-only (user_id is auth.uid()) and unreachable by accident (every client
// site mints a fresh uuid), which is why it is a P3 and not a P0 — but it is
// exactly the shape that stops being self-only the day someone adds a
// server-derived key to the same namespace, which is the thing the accrual
// engine already does (`hr_seed(user, slot, 'intent:accrue:<watermark>')`).
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// The REAL migration chain from tests/schema-apply-order.json, applied verbatim
// into PGlite (real PostgreSQL, in process), then a real player through the REAL
// rate-gated RPCs as `authenticated` with a JWT subject set.
//
// ⚠ IT REPLAYS THE **WHOLE** CHAIN — no `upTo` — ON PURPOSE. The migration is a
//   PATCHER: it rewrites twelve bodies it does not own. A later migration that
//   restates any of them from a template silently deletes the hardening, and
//   that is not a hypothetical (it is the b484–b487 wave). CHAIN-END is the only
//   position from which the property can be asserted, so P6 asserts it there.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend; two simultaneous retries of one
//     gesture are not reachable. What makes that race safe is the advisory lock
//     each body already takes plus `on conflict do nothing` on the intents row,
//     neither of which this change touches.
//   · PostgREST, the pooler, the JWT.
//   · PRODUCTION's ACL for the twelve — the migration asserts proacl is
//     byte-identical across each replace, at apply time, on the real database.
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';

const MIG = '2026-09-03-intent-mismatch-class.sql';

/* THE TWELVE. Named here as well as in the migration on purpose: this list is
   what a chain-end sweep checks, so a body quietly dropped from the migration's
   own values list still fails here. */
export const GUARDED = [
  'public.hr_bank_move(int,text,bigint,text,uuid)',
  'public.hr_bounty_spend__ungated(int,text,int,bigint,uuid)',
  'public.hr_claim_goal__ungated(text,boolean,int,uuid)',
  'public.hr_farm_harvest(int,int,uuid)',
  'public.hr_farm_plant(int,int,text,uuid)',
  'public.hr_farm_upgrade_plot(int,uuid)',
  'public.hr_farm_water(int,int,uuid)',
  'public.hr_put_client_state__ungated(int,jsonb,uuid)',
  'public.hr_set_style__ungated(text,text,int,uuid)',
  'public.hr_trait_buy__ungated(text,int,uuid)',
  'public.hr_worker_assign(int,text,text,text,uuid)',
  'public.hr_worker_hire(int,uuid)',
];

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   A guard that only catches the defect it was written for is a guard shaped
   around its own test. Each entry breaks ONE property of the fix; `--selftest`
   requires every one of them to be caught. `pairs` states several anchored
   replacements at once, which the two "the migration would refuse to apply"
   mutations need: without softening the migration's OWN assertion the run
   throws, which counts as caught but proves nothing about the guard. */
const MUTATIONS = {
  no_intent_compare: {
    why: 'THE DEFECT ITSELF, restored: the helper stops comparing `intent`, so a key claimed by '
       + 'client_state_put answers a goal claim with the client-state envelope and the completed '
       + 'daily is spent for nothing. P1 must catch it.',
    find: '  if (v_row.intent is not null and v_row.intent is distinct from p_intent)\n'
        + '     or (p_slot is not null and v_row.slot is distinct from p_slot) then',
    repl: '  if (false and v_row.intent is distinct from p_intent)\n'
        + '     or (p_slot is not null and v_row.slot is distinct from p_slot) then',
  },
  no_slot_compare: {
    why: 'the slot half is dropped — the hr_apply §S6 defect (one key applied on slot 0 and then '
       + 'presented on slot 1 answers ok:true and applies NOTHING, on the character the player is '
       + 'looking at). P3 must catch it.',
    find: '     or (p_slot is not null and v_row.slot is distinct from p_slot) then',
    repl: '     or (false and v_row.slot is distinct from p_slot) then',
  },
  mismatch_returns_null: {
    why: 'a mismatch answers NULL instead of refusing, so the caller falls through and DOES THE '
       + 'WORK AGAIN under a key that already belongs to another intent — the result is then '
       + 'silently not cached (`on conflict do nothing`). Worse than the bug it replaces.',
    find: "    return jsonb_build_object('ok', false, 'outcome', 'refused', 'error', 'intent_mismatch');",
    repl: '    return null;',
  },
  null_intent_mismatches: {
    why: 'a stored NULL intent (a row written before the column was populated) is treated as a '
       + 'MISMATCH, so a legitimate retry of a real gesture is refused. Fabricating a refusal out '
       + 'of missing data is the fail-OPEN-into-a-refusal direction. P4 must catch it.',
    find: '  if (v_row.intent is not null and v_row.intent is distinct from p_intent)',
    repl: '  if (v_row.intent is distinct from p_intent)',
  },
  helper_client_reachable: {
    why: 'a hand adds `grant execute … to authenticated` — and the helper takes a uuid ARGUMENT, so '
       + 'that is "read any player\'s intent cache" as any signed-in client. P5 must catch it '
       + 'WITHOUT leaning on the migration\'s own §3, which is why §3\'s reachability assertion is '
       + 'neutered here too.',
    pairs: [
      ['revoke execute on function public.hr_intent_replay(uuid, int, uuid, text) from anon, authenticated, service_role;',
        'grant execute on function public.hr_intent_replay(uuid, int, uuid, text) to authenticated;'],
      ["  if has_function_privilege('anon', 'public.hr_intent_replay(uuid,int,uuid,text)', 'execute')\n"
        + "     or has_function_privilege('authenticated', 'public.hr_intent_replay(uuid,int,uuid,text)', 'execute')\n"
        + "     or has_function_privilege('service_role', 'public.hr_intent_replay(uuid,int,uuid,text)', 'execute') then",
        '  if false then'],
    ],
  },
  service_role_revoke_dropped: {
    why: 'the four-role revoke is narrowed to three, leaving service_role. MEASURED ON PRODUCTION '
       + '2026-08-30: pg_default_acl for FUNCTIONS owned by `postgres` in public is '
       + '{postgres=X, service_role=X}, so a new function IS born service_role-executable there — '
       + 'while the PGlite fixture\'s default ACL is narrower and cannot show it. P7 (a static read '
       + 'of the migration text) is the only thing that can catch this class, which is exactly why '
       + 'P7 exists beside the behavioural probes.',
    find: 'revoke execute on function public.hr_intent_replay(uuid, int, uuid, text) from anon, authenticated, service_role;',
    repl: 'revoke execute on function public.hr_intent_replay(uuid, int, uuid, text) from anon, authenticated;',
  },
  one_body_left_unguarded: {
    why: 'hr_claim_goal — the verb the finding actually named — is dropped from the patch list. '
       + 'P1 and P6 must both catch it; P6 is the one that also catches a FUTURE migration '
       + 'restating a patched body from a template.',
    pairs: [
      ["      ('public.hr_claim_goal__ungated(text,boolean,int,uuid)',   'v_cached', '    ', 'v_slot', $lbl$'goal_claim'$lbl$),",
        ''],
      ['  if v_patched + v_already <> 12 then', '  if v_patched + v_already <> 11 then'],
      ["    'public.hr_claim_goal__ungated(text,boolean,int,uuid)',\n    'public.hr_farm_harvest(int,int,uuid)',\n    'public.hr_farm_plant(int,int,text,uuid)',\n    'public.hr_farm_upgrade_plot(int,uuid)',\n    'public.hr_farm_water(int,int,uuid)',\n    'public.hr_put_client_state__ungated(int,jsonb,uuid)',\n    'public.hr_set_style__ungated(text,text,int,uuid)',\n    'public.hr_trait_buy__ungated(text,int,uuid)',\n    'public.hr_worker_assign(int,text,text,text,uuid)',\n    'public.hr_worker_hire(int,uuid)']\n  loop\n    v_src := replace(pg_get_functiondef(s::regprocedure), chr(13), '');\n    -- (a) THE GUARD IS THERE, exactly once.",
        "    'public.hr_farm_harvest(int,int,uuid)',\n    'public.hr_farm_plant(int,int,text,uuid)',\n    'public.hr_farm_upgrade_plot(int,uuid)',\n    'public.hr_farm_water(int,int,uuid)',\n    'public.hr_put_client_state__ungated(int,jsonb,uuid)',\n    'public.hr_set_style__ungated(text,text,int,uuid)',\n    'public.hr_trait_buy__ungated(text,int,uuid)',\n    'public.hr_worker_assign(int,text,text,text,uuid)',\n    'public.hr_worker_hire(int,uuid)']\n  loop\n    v_src := replace(pg_get_functiondef(s::regprocedure), chr(13), '');\n    -- (a) THE GUARD IS THERE, exactly once."],
    ],
  },
};

const UUID = () => crypto.randomUUID();

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  const patches = mutate
    ? new Map([[MIG, MUTATIONS[mutate].pairs
        || [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]]]])
    : undefined;
  /* NO `upTo` — see the header. The property must hold at the END of the chain. */
  const { db } = await bootReplay({ patches });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* SESSION-SCOPED (`is_local = false`): PGlite runs each query in its own
     implicit transaction, so a `set local` GUC is gone by the next statement and
     auth.uid() would read NULL. (The idiom tests/modal-goal-claim.mjs proved.) */
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, two real characters ─────────────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'imm@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['ImmProbe']);
  for (const slot of [0, 1]) {
    await gate();
    const cr = await asUser(uid, 'select public.hr_create_character($1) as r', [slot]);
    ok(cr?.ok === true, `FIXTURE: hr_create_character(${slot}) refused: ${JSON.stringify(cr)}`);
  }

  const goldOf = async (slot = 0) => Number((await q(
    'select gold::text g from player_state where user_id=$1 and slot=$2', [uid, slot]))[0].g);
  const dayKey = (await q('select public.hr_utc_day_key(now()) as r'))[0].r;
  /* The counter a daily is graded on, stamped the way the ENGINE writes it
     (kind='daily', key='ev:<counter>', period=<utc day>).
     TWO GOALS, because a daily is claimable ONCE per period: P1 spends
     `gather_logs` proving the refusal did not consume it, so P2's
     replay-still-replays probe needs its own (`mine_ore`, same shape, same
     price, a different counter). */
  const complete = (key, n) => q(
    `insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
     values ($1, 0, 'daily', $2, $3, $4, 'active')
     on conflict (user_id, slot, kind, key, period_key)
       do update set value = public.player_progress.value + excluded.value`,
    [uid, key, n, dayKey]);

  const putState = async (slot, idem) => {
    await gate();
    return asUser(uid, 'select public.hr_put_client_state($1,$2::jsonb,$3) as r',
      [slot, JSON.stringify({ ui: { tab: 'home' } }), idem]);
  };
  const claimGoal = async (idem, goal = 'gather_logs', slot = 0) => {
    await gate();
    return asUser(uid, 'select public.hr_claim_goal($1,$2,$3,$4) as r',
      [goal, false, slot, idem]);
  };

  const obs = { dayKey };

  // ── P1. THE HEADLINE: A KEY BURNED ON A FREE VERB CANNOT ANSWER A CLAIM ──
  await complete('ev:chopped', 25);
  const k1 = UUID();
  obs.p1_state = await putState(0, k1);
  const goldBefore = await goldOf();
  obs.p1_claim = await claimGoal(k1);
  obs.p1_gold_delta = (await goldOf()) - goldBefore;
  /* …AND THE GOAL SURVIVES THE REFUSAL. A refusal that consumed the claim would
     be the same defect wearing a different error code. */
  obs.p1_after = await claimGoal(UUID());
  obs.p1_after_gold = (await goldOf()) - goldBefore;
  /* Nothing was journalled for the refused call: exactly ONE goal_claim ledger
     row exists, from the honest claim above. */
  obs.p1_ledger = Number((await q(
    "select count(*)::text c from player_ledger where user_id=$1 and intent like 'goal_claim%'",
    [uid]))[0].c);

  // ── P2. A GENUINE REPLAY STILL REPLAYS (the property being hardened, not removed)
  await complete('ev:mined', 25);
  const k2 = UUID();
  const g2 = await goldOf();
  obs.p2_first = await claimGoal(k2, 'mine_ore');
  obs.p2_first_gold = (await goldOf()) - g2;
  const g2b = await goldOf();
  obs.p2_replay = await claimGoal(k2, 'mine_ore');
  obs.p2_replay_gold = (await goldOf()) - g2b;

  // ── P3. THE SLOT HALF (hr_apply §S6's own live example) ──────────────
  const k3 = UUID();
  obs.p3_slot0 = await putState(0, k3);
  obs.p3_slot1 = await putState(1, k3);

  // ── P4. A ROW WITH NO STORED INTENT IS A MATCH, NOT A MISMATCH ────────
  // Rows written before the column was populated must still replay. Inserted
  // directly because no live writer can produce one any more.
  const k4 = UUID();
  await q("insert into public.player_intents (user_id, intent_id, slot, intent, result, at) "
    + "values ($1,$2,0,null,$3::jsonb,now())",
  [uid, k4, JSON.stringify({ ok: true, legacy: true })]);
  obs.p4 = await putState(0, k4);

  // ── P5. THE HELPER REACHES NO CLIENT ──────────────────────────────────
  obs.p5 = (await q(
    `select has_function_privilege('anon','public.hr_intent_replay(uuid,int,uuid,text)','execute') as anon,
            has_function_privilege('authenticated','public.hr_intent_replay(uuid,int,uuid,text)','execute') as auth,
            has_function_privilege('service_role','public.hr_intent_replay(uuid,int,uuid,text)','execute') as svc,
            (select p.proacl is null from pg_proc p
              where p.oid='public.hr_intent_replay(uuid,int,uuid,text)'::regprocedure) as default_acl,
            (select p.prosecdef from pg_proc p
              where p.oid='public.hr_intent_replay(uuid,int,uuid,text)'::regprocedure) as secdef,
            exists (select 1 from pg_proc p, aclexplode(p.proacl) a
                     where p.oid='public.hr_intent_replay(uuid,int,uuid,text)'::regprocedure
                       and a.grantee = 0) as public_exec`))[0];

  // ── P6. CHAIN-END: EVERY GUARDED BODY IS STILL GUARDED ────────────────
  obs.p6 = [];
  for (const sig of GUARDED) {
    let row = null;
    try {
      row = (await q(
        `select (length(src) - length(replace(src,'hr_intent_replay(','')))
                  / length('hr_intent_replay(')          as guards,
                position('from public.player_intents' in src) as raw
           from (select replace(pg_get_functiondef($1::regprocedure), chr(13),'') as src) s`,
        [sig]))[0];
    } catch (e) { row = { guards: -1, raw: -1, err: String(e.message).split('\n')[0] }; }
    obs.p6.push({ sig, ...row });
  }

  /* ── P7. THE REVOKE, READ FROM THE FILE ──────────────────────────────────
     PGlite's fixture and production do NOT have the same default ACL for
     functions. Measured on nezapsylztqbbwuwembx 2026-08-30: pg_default_acl for
     FUNCTIONS owned by `postgres` in `public` is {postgres=X, service_role=X},
     so a new function there is born SERVICE_ROLE-executable; the replay's
     fixture is narrower and a missing service_role revoke is invisible to every
     behavioural probe above. The migration's own §3 asserts it at apply time on
     the real database — this is the half that fails the BUILD. */
  // LF in memory: the migrations are checked in with CRLF on Windows and the
  // mutation anchors are written with LF (the same normalisation bootReplay does).
  obs.p7 = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  if (mutate && (MUTATIONS[mutate].pairs || [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]])) {
    for (const [find, repl] of (MUTATIONS[mutate].pairs
        || [[MUTATIONS[mutate].find, MUTATIONS[mutate].repl]])) {
      obs.p7 = obs.p7.split(find).join(repl);
    }
  }

  return obs;
}

function grade(o) {
  // ── P1 ────────────────────────────────────────────────────────────────
  ok(o.p1_state && o.p1_state.ok === true,
    `P1 fixture: hr_put_client_state refused: ${JSON.stringify(o.p1_state)}`);
  ok(o.p1_claim && o.p1_claim.ok === false && o.p1_claim.error === 'intent_mismatch',
    'P1 THE DEFECT: a key already claimed by `client_state_put` was accepted by hr_claim_goal, '
    + `which answered ${JSON.stringify(o.p1_claim)} instead of intent_mismatch. One namespace, `
    + 'one key, any verb — the completed daily is spent and nothing is paid.');
  ok(o.p1_gold_delta === 0,
    `P1: the refused claim moved gold by ${o.p1_gold_delta} — a refusal must change nothing.`);
  ok(o.p1_after && o.p1_after.ok === true,
    `P1: after the refusal the goal was no longer claimable with a FRESH key `
    + `(${JSON.stringify(o.p1_after)}). A refusal that consumes the claim is the same bug.`);
  ok(o.p1_after_gold > 0,
    `P1: the honest claim with a fresh key paid ${o.p1_after_gold} gold — expected the catalogue `
    + 'reward. If this is 0 the fixture is degenerate and every other assertion here is vacuous.');
  ok(o.p1_ledger === 1,
    `P1: ${o.p1_ledger} goal_claim ledger row(s) — expected exactly 1 (the honest claim). `
    + 'A refused call must journal nothing.');

  // ── P2 ────────────────────────────────────────────────────────────────
  ok(o.p2_first && o.p2_first.ok === true && o.p2_first_gold > 0,
    `P2 fixture: the first claim did not pay (${JSON.stringify(o.p2_first)}, `
    + `+${o.p2_first_gold} gold)`);
  ok(o.p2_replay && o.p2_replay.ok === true,
    `P2 REGRESSION: a genuine retry of the SAME intent with the SAME key was refused `
    + `(${JSON.stringify(o.p2_replay)}). Hardening the cache must not break the cache — a client `
    + 'whose success response was lost on the wire retries with the same key by design.');
  ok(o.p2_replay_gold === 0,
    `P2: the replay paid ${o.p2_replay_gold} gold a second time — idempotency is gone.`);

  // ── P3 ────────────────────────────────────────────────────────────────
  ok(o.p3_slot0 && o.p3_slot0.ok === true,
    `P3 fixture: the slot-0 call failed: ${JSON.stringify(o.p3_slot0)}`);
  ok(o.p3_slot1 && o.p3_slot1.ok === false && o.p3_slot1.error === 'intent_mismatch',
    'P3: one key applied on slot 0 and then presented on slot 1 answered '
    + `${JSON.stringify(o.p3_slot1)} instead of intent_mismatch — the exact live shape hr_apply `
    + '§S6 records (ok:true, replayed, APPLIED NOTHING, on the character in front of the player).');

  // ── P4 ────────────────────────────────────────────────────────────────
  ok(o.p4 && o.p4.legacy === true,
    'P4: a cached row with a NULL `intent` (written before the column was populated) must still '
    + `replay its envelope; got ${JSON.stringify(o.p4)}. Fabricating a mismatch out of missing `
    + 'data refuses a legitimate retry.');

  // ── P5 ────────────────────────────────────────────────────────────────
  ok(o.p5 && o.p5.anon === false && o.p5.auth === false && o.p5.svc === false,
    `P5: hr_intent_replay is executable by a client role (${JSON.stringify(o.p5)}). It takes a uuid `
    + 'ARGUMENT, so a grant is "read any player\'s intent cache".');
  ok(o.p5 && o.p5.default_acl === false && o.p5.public_exec === false,
    `P5: hr_intent_replay still carries a PUBLIC execute grant (${JSON.stringify(o.p5)}). A NULL `
    + 'proacl is the DEFAULT acl, which grants EXECUTE to PUBLIC — "no acl" is the failure.');
  ok(o.p5 && o.p5.secdef === false,
    'P5: hr_intent_replay must be SECURITY INVOKER — as a DEFINER function taking a uuid argument '
    + 'it is an intent-cache read oracle for anyone who ever gets a grant on it.');

  // ── P6 ────────────────────────────────────────────────────────────────
  for (const r of o.p6) {
    ok(Number(r.guards) === 1,
      `P6 CHAIN-END: ${r.sig} carries ${r.guards} hr_intent_replay call(s), expected exactly 1`
      + `${r.err ? ' (' + r.err + ')' : ''}. Either the migration stopped patching it, or a LATER `
      + 'migration restated the body from a template and deleted the hardening — which is the '
      + 'b484–b487 class. Re-applying 2026-09-03-intent-mismatch-class.sql is the fix.');
    ok(Number(r.raw) === 0,
      `P6: ${r.sig} still reads player_intents directly (position ${r.raw}) — a body that reads the `
      + 'cache twice, once through the guard and once around it, is unguarded.');
  }

  // ── P7 ────────────────────────────────────────────────────────────────
  const sql = String(o.p7 || '');
  for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
    const re = new RegExp(
      String.raw`revoke\s+execute\s+on\s+function\s+public\.hr_intent_replay\s*\([^)]*\)\s*from[^;]*\b`
      + role + String.raw`\b`, 'i');
    ok(re.test(sql),
      `P7: ${MIG} does not revoke EXECUTE on hr_intent_replay from \`${role}\`. All four, every `
      + "time: production's default ACL for FUNCTIONS owned by postgres in public is "
      + '{postgres=X, service_role=X} (measured 2026-08-30), and the supabase_admin default ACL — '
      + 'which applies to anything not owned by postgres — additionally carries anon and '
      + 'authenticated. Revoking three of the four leaves the privilege intact via the fourth.');
  }
  ok(!/grant\s+execute\s+on\s+function\s+public\.hr_intent_replay/i.test(sql),
    `P7: ${MIG} GRANTS execute on hr_intent_replay to someone. It takes a uuid ARGUMENT; the `
    + 'correct ACL is the empty one, and the twelve SECURITY DEFINER callers reach it without a '
    + 'grant because a definer function runs as its owner.');
}

/** The guard, as a function, so tests/run-smoke.mjs can call it. */
export async function intentMismatchGuard() {
  problems.length = 0;
  grade(await run());
  return [...problems];
}

// ── main (only when run directly; run-smoke imports the guard above) ─────
const argv = process.argv.slice(2);
const RUN_DIRECTLY = !!process.argv[1]
  && process.argv[1].replace(/\\/g, '/').endsWith('tests/intent-mismatch.mjs');
if (RUN_DIRECTLY) {
  if (argv.includes('--list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
    process.exit(0);
  }

  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  const selftest = argv.includes('--selftest');

  if (selftest) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      problems.length = 0;
      let caught = false;
      try { grade(await run(id)); caught = problems.length > 0; }
      catch (e) { caught = true; }   // a mutation that makes the run throw is also caught
      console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${id}`);
      if (!caught) { bad++; console.log(`         ${MUTATIONS[id].why}`); }
    }
    console.log(bad ? `\n${bad} mutation(s) NOT caught — the guard is blind to them.`
      : `\nall ${Object.keys(MUTATIONS).length} mutations caught.`);
    process.exit(bad ? 1 : 0);
  }

  grade(await run(mutateArg ? mutateArg.split('=')[1] : undefined));
  if (problems.length) {
    console.error(`intent-mismatch: ${problems.length} problem(s)\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(mutateArg ? 0 : 1);
  }
  console.log('intent-mismatch: green — one key answers one intent on one slot, a genuine replay '
    + 'still replays, twelve bodies guarded at chain end, the helper reaches nobody.');
  if (mutateArg) { console.error('the mutation was NOT caught'); process.exit(1); }
}
