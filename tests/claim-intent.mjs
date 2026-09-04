#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/claim-intent.mjs — THE GRANT INTENT, BEHAVIOURALLY.
//
// THE INVARIANTS (each one is a line in the change contract, and each one is
// mutation-proven RED — `--selftest`):
//
//   1. ⚠ A CLAIM CAN BE MADE EXACTLY ONCE. A second attempt with a FRESH key
//      and a FRESH version — i.e. an honest second click, not a replay — is
//      refused `not_claimable`, and the refusal rolls back the `progress` write
//      that came with it, so tomorrow's streak cannot inherit a corrupted value.
//   2. THE SERVER OWNS THE PRICE. The gold paid equals src/data/rewards.js, and
//      the multiplier is CAPPED — the client has been paying an unbounded one.
//   3. THE SERVER OWNS THE PERIOD. The client has no field through which to name
//      a day, the period in the delta is `hr_utc_day_key(now())`, and it is part
//      of `journal.intent` — so one key reused on a later day is a loud
//      `intent_mismatch`, never a silent no-op.
//   4. THE SERVER OWNS THE STREAK. It is derived from the character's own claim
//      history (yesterday's row + 1), never from `G.streak.count`.
//   5. A REPLAY APPLIES NOTHING AND RECEIPTS NOTHING.
//   6. THE REGISTRY IS READ, NOT DECORATION — bucket, needsKey, ledgerKind,
//      status and `periodic` each change behaviour.
//   7. A BLOCKED OR UNKNOWN REWARD IS REFUSED BY NAME, BEFORE ANY DATABASE WORK.
//
// ── WHERE IT RUNS, AND WHY THAT IS THE STRONGEST AVAILABLE PROOF ────────
// In process against a REAL PostgreSQL (PGlite / PG 18 in WASM) with the REAL
// migration chain applied verbatim — the clan chain (for `hr_utc_day_key`), the
// generated catalogue, daily-budget, apply-engine, character-bootstrap,
// activity-intent, intent-key-hygiene, tool-carry and the new
// 2026-08-16-claim-reward.sql. Nothing server-side is stubbed or modelled, and
// the ORDER is load-bearing: intent-key-hygiene then tool-carry must be the last
// two files defining hr_apply, and the new migration's §0 refuses to install if
// they are not.
//
// And THE INTENT ITSELF IS NOT PORTED EITHER. `runClaimReward` is imported from
// supabase/functions/hr-accrue/claim-reward.js — the same bytes
// tools/pack-edge.mjs ships — behind its one injected seam, `exec`.
//
// ── WHAT THIS DOES **NOT** PROVE ────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend. The advisory lock in hr_apply is
//     EXERCISED and contended by nothing. C7 reaches the state a concurrent
//     claimer leaves behind by INJECTING it at the point a race would produce
//     it — a fault injection, not a race. This is the program's standing
//     cutover blocker and this file does not close it.
//   · A DAY BOUNDARY IN REAL TIME. "Yesterday" is manufactured by moving the
//     committed row's `period_key` with owner DML — the harness playing the part
//     of a day passing. The DAY KEYS themselves are the server's, read back out
//     of `hr_claim_lookup`, never computed here.
//   · RLS AND GRANTS beyond `set role hr_engine` around every statement; the
//     migration's own §4 asserts the capability matrix.
//   · THE HTTP SHELL — JWT, pooler and CORS are index.ts's.
//
// ── USAGE ───────────────────────────────────────────────────────────────
//   node tests/claim-intent.mjs               clean run
//   node tests/claim-intent.mjs --list        the mutation catalogue
//   node tests/claim-intent.mjs --selftest    every mutation must be CAUGHT
//   node tests/claim-intent.mjs --mutate=<id>
// A mutation nothing catches is reported as SLIPPED and exits 1: a guard that
// cannot demonstrate it sees failure is treated as broken, not as a pass.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootChain, ROOT } from './pglite-chain.mjs';

const MIG = (f) => join(ROOT, 'supabase', 'migrations', f);
const FN = (f) => join(ROOT, 'supabase', 'functions', 'hr-accrue', f);
const DATA = (f) => join(ROOT, 'src', 'data', f);

/* Appended to the SHARED chain (tests/pglite-chain.mjs), which already applies
   schema.sql + clan-seat + player-state + accrue-gate. Each extra is a real
   dependency:
     catalogue           hr_items / hr_activities / the start kit
     daily-budget        apply-engine FAILS CLOSED without hr_day_budget_check
     accrual             hr_offline_cap_ms (apply-engine's chain expects it)
     apply-engine        hr_apply, the one writer
     character-bootstrap hr_create_character, so the character under test is
                         made the way a real player's is
     activity-intent     hr_rate_gate's `activity` bucket, which
                         2026-08-16-claim-reward.sql restates and must not drop
     key-hygiene         C1 + C3. Replaces hr_apply, so it must come after it
     tool-carry          replaces hr_apply too, and `tool_carry` is one of the
                         terms claim-reward's §0 asserts against the live body
     gold-intents        hr_rate_gate's `shop` bucket. ⚠ ADDED 2026-08-16 AND
                         LOAD-BEARING: claim-reward's gate body is DERIVED from
                         this file's, and its §0 now REFUSES to install against a
                         gate with no `shop` arm. Without this link the chain
                         refuses — correctly — because a database that has not
                         applied gold-intents is not the database production is,
                         and staging claim-reward against it is how the `shop`
                         arm gets silently deleted. Do not "fix" a refusal here
                         by weakening §0; add the missing predecessor.
     gem-daily-budget    the CURRENT last toucher of hr_apply (Security's gem
                         ceiling). Here so the body this slice drives is the one
                         production runs, not one revision behind it
     claim-reward        the file this slice stages */
const EXTRA = [
  ['catalogue', MIG('2026-08-11-catalogue.generated.sql')],
  ['daily-budget', MIG('2026-08-11-daily-budget.sql')],
  ['accrual', MIG('2026-08-11-accrual.sql')],
  ['apply-engine', MIG('2026-08-11-apply-engine.sql')],
  ['character-bootstrap', MIG('2026-08-14-character-bootstrap.sql')],
  ['activity-intent', MIG('2026-08-15-activity-intent.sql')],
  ['key-hygiene', MIG('2026-08-15-intent-key-hygiene.sql')],
  ['auto-eat', MIG('2026-08-15-auto-eat.sql')],
  ['tool-carry', MIG('2026-08-15-tool-carry.sql')],
  ['gold-intents', MIG('2026-08-15-gold-intents.sql')],
  ['gem-daily-budget', MIG('2026-08-15-gem-daily-budget.sql')],
  ['claim-reward', MIG('2026-08-16-claim-reward.sql')],
];

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────────
   Each entry patches a REAL source file — the migration SQL, the intent module
   or the reward data — with a bug this suite claims to catch. `--selftest`
   demands every one of them turns the run RED. A patch whose anchor does not
   match, or which produces identical text, is a HARNESS failure: a planted bug
   that was never planted is decoration. */
const MUTATIONS = {
  no_double_claim_lock: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 1 — the delta stops carrying progress_claim, so the claim never reaches '
       + '"claimed" and can be made again every day, forever',
    find: "    progress_claim: [{ kind, key, period: p }],\n",
    repl: '',
  },
  claimed_state_not_written: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 1 — the progress row is written "active" instead of "done", so '
       + 'progress_claim finds nothing to flip and EVERY claim is refused',
    find: "    progress: [{ kind, key, period: p, add: priced.add, state: 'done' }],",
    repl: "    progress: [{ kind, key, period: p, add: priced.add, state: 'active' }],",
  },
  foreign_today_row_admitted: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 1 — a today-row in a state this engine did not write is admitted, so its '
       + 'unknown `value` is compounded by the progress block, then claimed and PAID. hr_apply '
       + 'cannot catch this: from its side it is a well-formed claim of a "done" row',
    find: "  if (existing && existing.state !== 'claimed') {",
    repl: '  if (false) {',
  },
  claimed_row_intercepted: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 5 — an already-claimed today-row is intercepted at the edge again, so a '
       + 'REPLAY (a retry after a dropped response) is answered not_claimable for a reward that '
       + 'was genuinely just paid — Security C5, re-created',
    find: "  if (existing && existing.state !== 'claimed') {",
    repl: '  if (existing) {',
  },
  uncapped_mult: {
    file: DATA('rewards.js'),
    why: 'INVARIANT 2 — the week multiplier loses its cap, so a long streak proposes an '
       + 'unbounded payout (measured on the shipped cycle: x53 at two years, x79 at three)',
    find: '  const mult = Math.min(DAILY_LOGIN_MAX_WEEK_MULT, 1 + weeksDone * DAILY_LOGIN_WEEK_BONUS);',
    repl: '  const mult = 1 + weeksDone * DAILY_LOGIN_WEEK_BONUS;',
  },
  price_from_thin_air: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 2 — the payout stops coming from the catalogue',
    find: '  const p = priceDailyLogin(streak);',
    repl: '  const p = { gold: 777, gems: 0, cycleDay: 1, weeksDone: 0, mult: 1 };',
  },
  client_names_period: {
    file: FN('request.js'),
    why: 'INVARIANT 3 — the parser starts reading a `period` off the request body, which is the '
       + 'one field that would make "claim every day since launch" a single loop',
    find: "  out.key = (keyRaw !== null && REWARD_KEY_RE.test(keyRaw)) ? keyRaw : null;",
    repl: "  out.key = (keyRaw !== null && REWARD_KEY_RE.test(keyRaw)) ? keyRaw : null;\n"
        + "  out.period = ownString(r, 'period');",
  },
  intent_name_no_period: {
    file: FN('intents.js'),
    why: 'INVARIANT 3 — journal.intent drops the period, so one key reused on a LATER day '
       + 'answers replayed:true and pays nothing, silently',
    find: '  return period ? `${base}:${period}` : base;',
    repl: '  return base;',
  },
  streak_ignores_state: {
    /* ⚠ src/data/rewards.js, NOT claim-reward.js — deriveLoginStreak MOVED in
       4cc7d6cd ('the sheet advertised a day the server would not pay — TWO
       STREAKS, one name'), which put the client preview and the server pricer on
       ONE implementation and left claim-reward.js merely importing and
       re-exporting it (its lines 183 and 244). This mutation stayed pointed at
       the old home, so from that commit --selftest exited 2 on
       "anchor matched 0 times" — a HARNESS verdict, so nothing was ever
       silently graded as a catch, but the run STOPPED there and the twenty
       mutations declared after it never executed at all. That is the CI
       claim-intent red. The anchor TEXT is unchanged because the line is
       unchanged; only the file it lives in moved. */
    file: DATA('rewards.js'),
    why: 'INVARIANT 4 — the streak counts yesterday\'s row whatever state it is in, so an '
       + 'unclaimed row inflates today\'s reward',
    find: "  if (!row || row.state !== 'claimed') return 1;",
    repl: '  if (!row) return 1;',
  },
  streak_always_one: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 4 — the streak never advances, so a returning player is paid Day 1 forever',
    find: '  const streak = deriveLoginStreak(lookup);',
    repl: '  const streak = 1;',
  },
  granted_on_replay: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 5 — a replay invents a receipt for a payment THIS invocation did not make '
       + '(index.ts\'s S7 mistake, in a new file)',
    find: '      granted: res.replayed === true ? null : {',
    repl: '      granted: {',
  },
  registry_bucket_bogus: {
    file: FN('intents.js'),
    why: 'INVARIANT 6 — the registry names a rate bucket the database does not have; if nothing '
       + 'READS the registry this is invisible',
    find: "  claim_reward: Object.freeze({ bucket: 'claim', needsKey: true, collectsFirst: false }),",
    repl: "  claim_reward: Object.freeze({ bucket: 'claim_typo', needsKey: true, collectsFirst: false }),",
  },
  registry_needs_key_false: {
    file: FN('intents.js'),
    why: 'INVARIANT 6 — the registry says this intent needs no idempotency key, so a keyless '
       + 'claim reaches the database',
    find: "  claim_reward: Object.freeze({ bucket: 'claim', needsKey: true, collectsFirst: false }),",
    repl: "  claim_reward: Object.freeze({ bucket: 'claim', needsKey: false, collectsFirst: false }),",
  },
  gate_literal_bucket: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 6 — the rate bucket becomes a literal at the call site again. Behaviourally '
       + 'IDENTICAL today, so only the source assertion can see it — which is the whole point',
    find: '  const [read] = await exec(READ_SQL, [user, slot, rateBucketFor(VERB), v.kind, v.key]);',
    repl: "  const [read] = await exec(READ_SQL, [user, slot, 'claim', v.kind, v.key]);",
  },
  ledger_kind_literal: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 6 — the ledger kind stops coming from the registry, so which bucket a '
       + 'reward lands in for the rollup is decided by the engine rather than by content',
    find: '      kind: spec.ledgerKind,',
    repl: "      kind: 'admin',",
  },
  blocked_reward_admitted: {
    file: FN('claim-reward.js'),
    why: 'INVARIANT 7 — a claimable the server cannot own yet is admitted instead of refused '
       + 'by name, so it reaches the pricer table and the database',
    find: "  if (spec.status !== 'priced') {",
    repl: '  if (false) {',
  },
  /* ⚠ THIS IS NOT THE `catalogue_truthy` MUTATION IT STARTED AS, AND THE
     REASON IS A FINDING. The first draft mutated `hasOwnProperty` back to
     truthiness expecting review C6's prototype hazard to reappear. It SLIPPED,
     and the slip was correct: the registry key is `${kind}:${key}`, so it always
     contains a colon and can therefore never equal `constructor`, `__proto__`,
     `toString` or any other inherited member. The composite key is what makes
     the hazard structurally unreachable HERE — not the own-property check,
     which is kept as the house rule and as defence for whoever changes the key
     shape. So the mutation now removes THE THING THAT ACTUALLY DEFENDS: flatten
     the id to a bare key and both the prototype hazard and the registry return
     together. A mutation that plants a bug the code does not have is
     decoration; this one plants the bug the code was defending against. */
  flat_claimable_id: {
    file: DATA('rewards.js'),
    why: 'the registry key stops being composite. `${kind}:${key}` is what makes a prototype id '
       + '(`constructor`, `__proto__`) structurally unreachable — a bare key re-opens review C6 '
       + 'AND detaches the lookup from the registry',
    find: '  return `${kind}:${key}`;',
    repl: '  return key;',
  },
  /* Security G4, planted. `site` was REQUIRED and unread, so any value at all
     satisfied it. This mutation is what unread looks like in practice: the
     client site is renamed (or the file moved) and the registry keeps pointing
     at a symbol that no longer exists. Nothing behavioural can see it — the
     server never reads `site` — so if C0b is not doing real work this SLIPS. */
  site_points_nowhere: {
    file: DATA('rewards.js'),
    why: 'a claimable\'s `site` names a symbol that is not in the file it names — the required-'
       + 'but-unread field going stale, which is the whole of G4',
    find: "    site: 'src/features/daily-reward.js:76 claim()',",
    repl: "    site: 'src/features/daily-reward.js:76 claimTheThingThatWasRenamed()',",
  },
  registry_status_lies: {
    file: DATA('rewards.js'),
    why: 'the registry calls a claimable priced when this build has no pricer for it — the two '
       + 'lists drift and a player is told "not yet" for something the data says is ready',
    find: "  'flag:renown_rank': Object.freeze({\n    status: 'blocked',",
    repl: "  'flag:renown_rank': Object.freeze({\n    status: 'priced',",
  },
  reward_key_admits_namespace: {
    file: FN('request.js'),
    why: 'G2a: REWARD_KEY_RE is widened to admit a colon, so a namespaced entitlement key like '
       + 'character_slot:1 — the EXACT ownership flag hr_buy_hero_slot writes, which hr_apply\'s '
       + 'generic progress block would accept — becomes a claimable reward key. That is a gem-priced '
       + 'hero slot granted for free through claim_reward. The closure protecting the hero-slot '
       + 'entitlement must go RED by name when the reward-key regex loosens.',
    find: 'export const REWARD_KEY_RE = ACTIVITY_ID_RE;',
    repl: 'export const REWARD_KEY_RE = /^[a-z0-9_:]{1,64}$/;',
  },
  stamping_keys_empty: {
    file: FN('intents.js'),
    why: 'the list of delta keys that close the accrual window is emptied, so the fail-closed '
       + 'check that keeps `collectsFirst:false` honest can never fire',
    /* ⚠ THE LIST GREW AND THE ANCHOR DID NOT. b379 (b6e9a2bd, 2026-08-17) added
       'enchant' — an enchant stamps accrued_to for the same reason an equip
       does — and this mutation went on naming the two-element form, so from that
       commit it could not be planted. It was INVISIBLE until today because the
       selftest exited 2 on the FIRST stale anchor (streak_ignores_state) and
       never reached this one; the driver now records a HARNESS and keeps going,
       which is how both surfaced in a single run.
       The anchor is deliberately re-pinned to the whole literal rather than
       loosened to a prefix: this mutation's job is to empty the list, and a
       find-string that still matches after a THIRD key is added would silently
       plant a list that is empty of two keys and not of the third. */
    find: "export const STAMPING_DELTA_KEYS = Object.freeze(['equip', 'activity', 'enchant']);",
    repl: 'export const STAMPING_DELTA_KEYS = Object.freeze([]);',
  },
  delta_closes_window: {
    file: FN('claim-reward.js'),
    why: 'a claim\'s delta gains a window-closing key (the "claim it and equip it" reward). '
       + 'The fail-closed check must turn that into a LOUD refusal rather than a silently '
       + 'confiscated night',
    find: '  if (priced.gems) delta.gems = priced.gems;',
    repl: "  delta.equip = { weapon: null };\n  if (priced.gems) delta.gems = priced.gems;",
  },
  /* Security G3, planted. The receipt's tail is SPREAD from the pricer's `meta`,
     so renaming a key there is a one-word edit that changes the wire and touches
     nothing that looks like an interface — the client renders undefined and
     every behavioural assertion (gold, streak, period) stays green. Only a
     literal key-set assertion sees it. */
  meta_key_renamed: {
    file: FN('claim-reward.js'),
    why: 'the receipt\'s documented `cycle_day` is renamed in the pricer\'s meta. The wire shape '
       + 'changes, the header stops being true, and the client renders undefined — the exact G3 '
       + 'drift, in the direction it actually happens',
    find: '    meta: { streak, cycle_day: p.cycleDay, weeks: p.weeksDone, mult: p.mult },',
    repl: '    meta: { streak, cycleDay: p.cycleDay, weeks: p.weeksDone, mult: p.mult },',
  },
  /* The OTHER half of G3, and the half that actually shipped: the code is right
     and the PROSE is wrong. Nothing executes a comment, so only a test that
     reads the header can see it — and a client is written from the header. */
  header_spelling_drift: {
    file: FN('claim-reward.js'),
    why: 'the documented receipt goes back to the camelCase spelling the server does not emit '
       + '(`cycleDay,weeksDone`, no `mult`) — the literal G3 defect, which no behavioural '
       + 'assertion can see because a comment does not run',
    find: '//        granted:{kind,key,period,gold,gems,streak,cycle_day,weeks,mult} | null}',
    repl: '//        granted:{kind,key,period,gold,gems,streak,cycleDay,weeksDone} | null}',
  },
  /* Security G6, both halves, planted. */
  gate_skips_empty_period: {
    file: FN('claim-reward.js'),
    why: 'the shared period gate stops covering the \'\' period — the pre-fix behaviour, where a '
       + 'foreign row under a NON-PERIODIC claimable\'s permanent key is admitted, compounded and '
       + 'paid for',
    find: '  const existing = Object.prototype.hasOwnProperty.call(rows, period) ? rows[period] : null;',
    repl: "  const existing = (period !== '' && Object.prototype.hasOwnProperty.call(rows, period))\n"
        + '    ? rows[period] : null;',
  },
  gate_not_run_before_pricer: {
    file: FN('claim-reward.js'),
    why: 'runClaimReward stops running the shared gate and derives the period itself, so the check '
       + 'is again only whatever each pricer remembered to copy. BEHAVIOURALLY IDENTICAL today — '
       + 'priceLoginClaim still calls it — which is precisely why it needs a source assertion',
    find: '  const gate = resolveClaimPeriod({ spec: v.spec, lookup });',
    repl: '  const gate = { period: v.spec.periodic ? lookup.today : \'\' };',
  },
  gate_bucket_missing: {
    file: MIG('2026-08-16-claim-reward.sql'),
    migration: 'claim-reward',
    why: 'hr_rate_gate loses the claim bucket, so every claim is rate_limited',
    find: "    when 'claim'    then v_limit := 20; v_window := interval '1 minute';",
    repl: '    -- mutated: bucket removed',
  },
  lookup_widens: {
    file: MIG('2026-08-16-claim-reward.sql'),
    migration: 'claim-reward',
    why: 'hr_claim_lookup stops bounding itself to three period keys, so one call can scan a '
       + 'character\'s whole claim history',
    find: "         and period_key in ('', v_today, v_prev)), '{}'::jsonb));",
    repl: "         ), '{}'::jsonb));",
  },
  lookup_takes_the_day: {
    file: MIG('2026-08-16-claim-reward.sql'),
    migration: 'claim-reward',
    why: 'the day key stops being the server\'s — hr_claim_lookup reports yesterday as today, '
       + 'which is the shape of any caller-supplied period',
    find: '  v_today := public.hr_utc_day_key(now());',
    repl: "  v_today := public.hr_utc_day_key(now() - interval '1 day');",
  },
};

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit === undefined ? d : hit.slice(n.length + 3);
};
const has = (n) => argv.includes(`--${n}`);

const UID = '00000000-0000-4000-a349-000000000001';
const UID2 = '00000000-0000-4000-a349-000000000002';

const FIXTURE = `
insert into auth.users (id) values ('${UID}'), ('${UID2}') on conflict (id) do nothing;

create or replace function public.__a349_create(p_uid uuid, p_slot int)
returns jsonb language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  v := public.hr_create_character(p_slot);
  perform set_config('request.jwt.claim.sub', '', true);
  return v;
end $$;
`;

class Red extends Error {}
const fails = [];
function ok(cond, msg) { if (!cond) { fails.push(msg); throw new Red(msg); } }

async function boot(mutate) {
  const patchedJs = new Map();
  let sqlPatches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    if (!m) { const e = new Error(`unknown mutation "${mutate}"`); e.harness = true; throw e; }
    if (m.file.endsWith('.sql')) {
      sqlPatches = new Map([[m.migration, [[m.find, m.repl]]]]);
    } else {
      const src = (await readFile(m.file, 'utf8')).replace(/\r\n/g, '\n');
      const n = src.split(m.find).length - 1;
      if (n !== 1) {
        const e = new Error(`mutation "${mutate}" anchor matched ${n} times (need exactly 1) in ${m.file}`);
        e.harness = true; throw e;
      }
      const after = src.replace(m.find, m.repl);
      if (after === src) {
        const e = new Error(`mutation "${mutate}" produced identical text`); e.harness = true; throw e;
      }
      patchedJs.set(m.file, after);
    }
  }

  let db;
  try {
    ({ db } = await bootChain({ extra: EXTRA, patches: sqlPatches }));
  } catch (e) {
    if (e.harness) throw e;
    /* A mutation that makes a migration refuse to install IS the guard working —
       the migration's own do$$ self-check is a commit gate, and a bug that
       cannot be installed beats one that is detected at runtime. */
    throw new Red(`migration chain refused: ${e.message}`);
  }
  await db.exec(FIXTURE);

  const mods = await loadModules(patchedJs);
  return { db, ...mods };
}

async function loadModules(patched) {
  const { writeFile, mkdtemp, cp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { pathToFileURL } = await import('node:url');

  if (!patched.size) {
    const bust = `?t=${Date.now()}${Math.random()}`;
    const cr = await import(pathToFileURL(FN('claim-reward.js')).href + bust);
    const it = await import(pathToFileURL(FN('intents.js')).href + bust);
    const rq = await import(pathToFileURL(FN('request.js')).href + bust);
    const rw = await import(pathToFileURL(DATA('rewards.js')).href + bust);
    return { cr, it, rq, rw, fnDir: FN('') };
  }
  /* A mutated module has to be imported from disk, and it imports its siblings
     by relative path — so the WHOLE function directory AND src/ are copied to a
     temp dir at the same depth relative to ROOT, the patched file is
     overwritten there, and the copy is imported. Same depth matters:
     claim-reward.js reaches ../../../src/data/rewards.js. */
  const base = await mkdtemp(join(tmpdir(), 'hr-a349-'));
  const dir = join(base, 'supabase', 'functions', 'hr-accrue');
  await cp(join(ROOT, 'supabase', 'functions', 'hr-accrue'), dir, { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  for (const [file, text] of patched) {
    const rel = file.startsWith(join(ROOT, 'src'))
      ? join(base, 'src', 'data', file.split(/[\\/]/).pop())
      : join(dir, file.split(/[\\/]/).pop());
    await writeFile(rel, text, 'utf8');
  }
  const cr = await import(pathToFileURL(join(dir, 'claim-reward.js')).href);
  const it = await import(pathToFileURL(join(dir, 'intents.js')).href);
  const rq = await import(pathToFileURL(join(dir, 'request.js')).href);
  const rw = await import(pathToFileURL(join(base, 'src', 'data', 'rewards.js')).href);
  /* ⚠ SOURCE-READING ASSERTIONS MUST READ THE SOURCE THAT RAN. activity-intent's
     A14 originally read the repo path while a mutation ran from a temp copy, so
     its own mutation SLIPPED — an assertion pointed at a file nobody executed. */
  return { cr, it, rq, rw, fnDir: dir };
}

/** THE SEAM. One statement, rows out — exactly what index.ts hands the module.
 *  `set role hr_engine` around it, so every statement is enforced against the
 *  real grant table: hr_engine holds ZERO table privileges in every schema, so
 *  an intent that tried to touch a table directly would be refused here exactly
 *  as it would be in production. */
function makeExec(db, hooks = {}) {
  return async (text, params) => {
    if (hooks.before) await hooks.before(text, params);
    if (hooks.intercept) {
      const forced = await hooks.intercept(text, params);
      if (forced !== undefined) return forced;
    }
    await db.exec('set role hr_engine');
    let rows;
    try {
      rows = (await db.query(text, params)).rows;
    } finally {
      await db.exec('reset role');
    }
    /* `after` transforms what the SERVER said before the intent sees it. It is
       how this harness makes a day pass: PGlite has one clock and no way to move
       it, so C9 shifts `hr_claim_lookup`'s own answer forward by a day at the
       seam. A FAULT INJECTION at exactly the point real time would produce the
       same state — stated, not implied. Hooks run OUTSIDE the role switch. */
    return hooks.after ? ((await hooks.after(rows, text, params)) ?? rows) : rows;
  };
}

const uuid = () => crypto.randomUUID();
const state = async (db, uid, slot = 0) => (await db.query(
  'select * from public.player_state where user_id = $1 and slot = $2', [uid, slot])).rows[0];
const ledger = async (db, uid, slot = 0) => (await db.query(
  'select kind, intent, gold, gold_in, xp_in, qty_in, meta from public.player_ledger '
  + 'where user_id = $1 and slot = $2 order by at, id', [uid, slot])).rows;
const progress = async (db, uid, slot = 0) => (await db.query(
  'select kind, key, period_key, value, state from public.player_progress '
  + 'where user_id = $1 and slot = $2 order by kind, key, period_key', [uid, slot])).rows;
const dayKeys = async (db) => (await db.query(
  "select public.hr_utc_day_key(now()) as today, "
  + "public.hr_utc_day_key(now() - interval '1 day') as prev, "
  + "public.hr_utc_day_key(now() + interval '1 day') as next")).rows[0];

// ════════════════════════════════════════════════════════════════════════
async function run(mutate) {
  fails.length = 0;
  const { db, cr, it, rq, rw, fnDir } = await boot(mutate);
  const exec = makeExec(db);
  const call = (o) => cr.runClaimReward({ exec, user: UID, slot: 0, ...o });
  const login = () => ({ kind: 'daily', key: 'login' });
  /* The rate bucket is 20/min and this file makes far more than 20 calls, so
     the counter is cleared between groups. Owner DML — the harness resetting a
     fixture, not a code path under test. */
  const clearGate = () => db.query('delete from public.hr_rate_counters where user_id = $1', [UID]);

  // ── C0. THE REGISTRY AND THE PRICERS AGREE, IN BOTH DIRECTIONS ───────────
  // Two lists that must match, so neither is allowed to be the only one. A
  // `status:'priced'` row with no pricer is a live refusal nobody sees; a pricer
  // with no row is dead code that can never be reached.
  {
    const priced = cr.pricedClaimables();
    const pricers = cr.pricerIds();
    ok(priced.length > 0, 'C0-CONTROL: no claimable is priced at all — every assertion below is vacuous');
    ok(JSON.stringify(priced) === JSON.stringify(pricers),
      `C0: the registry says PRICED ${JSON.stringify(priced)} but this build has pricers for `
      + `${JSON.stringify(pricers)}. The two lists must be equal in both directions.`);
    // CONTROL: at least one claimable must be BLOCKED, or the refusal test below
    // proves nothing.
    const blocked = Object.keys(rw.CLAIMABLES).filter((k) => rw.CLAIMABLES[k].status === 'blocked');
    ok(blocked.length > 0, 'C0-CONTROL: nothing is blocked, so `reward_unavailable` is unreachable');
    for (const id of Object.keys(rw.CLAIMABLES)) {
      const row = rw.CLAIMABLES[id];
      for (const f of rw.CLAIMABLE_FIELDS) {
        ok(row[f] !== undefined, `C0: claimable '${id}' has no '${f}' — the registry is read on the hot path`);
      }
      ok(rw.CLAIMABLE_STATUSES.includes(row.status),
        `C0: claimable '${id}' has status '${row.status}', which is not one of ${rw.CLAIMABLE_STATUSES}`);
      if (row.status === 'blocked') {
        ok(typeof row.needs === 'string' && row.needs.length > 20,
          `C0: blocked claimable '${id}' does not say what it NEEDS — the refusal would carry no `
          + 'dependency and "not yet" would be undiagnosable');
      }
    }
  }

  /* ── C0b. `site` HAS A READER (Security G4) ──────────────────────────────
     THE FINDING: `site` was in CLAIMABLE_FIELDS — i.e. REQUIRED — and nothing
     anywhere read `spec.site`. A required field with no reader is decoration
     with a guard in front of it, which is worse than an optional one: it forces
     every future author to fill in a value that nothing will ever check, so the
     values rot and the rot is invisible. The registry's own header states the
     rule ("a row that no code path reads is decoration") and this row broke it.

     THE RULING: keep the field and GIVE IT A READER, rather than demote it.
     `site` is the wiring map — it is how the next author finds the six client
     call sites this verb replaces, and claim-reward.js's header is written
     against it. That is worth having. What it was missing is enforcement, so
     this is it: every `site` must name a file that EXISTS and a symbol that is
     actually IN it. The day daily-reward.js's `claim()` is renamed or the file
     moves, this goes red instead of the registry quietly pointing at nothing.

     WHAT IS DELIBERATELY NOT GRADED: the exact line number. It drifts on every
     edit above it, so asserting it would make an unrelated one-line change a
     red build and the number would be "fixed" by deleting the assertion. It is
     bounded (must be inside the file) and the SYMBOL is what is really pinned —
     a symbol is what a reader searches for anyway. */
  {
    const seen = [];
    for (const id of Object.keys(rw.CLAIMABLES)) {
      const site = rw.CLAIMABLES[id].site;
      ok(typeof site === 'string' && site.length > 0,
        `C0b: claimable '${id}' has no site — CLAIMABLE_FIELDS requires one`);
      const m = /^([^\s:]+):(\d+)\s+([A-Za-z_$][\w$]*)/.exec(site);
      ok(!!m,
        `C0b: claimable '${id}' spells its site as '${site}', which this reader cannot parse. The `
        + 'contract is `path/to/file.js:LINE symbolName(...)` — a shape a human AND this guard can '
        + 'both follow. A free-text site is a field nothing can check, which is what G4 was about.');
      const [, rel, lineStr, symbol] = m;
      let text = null;
      try { text = await readFile(join(ROOT, rel), 'utf8'); } catch { /* reported below */ }
      ok(text !== null,
        `C0b: claimable '${id}' names the site ${rel}, which does not exist. The registry is the `
        + 'wiring map for the six client call sites this verb replaces; one that points at a '
        + 'deleted or moved file sends the next author nowhere.');
      const lines = text.split('\n').length;
      ok(Number(lineStr) >= 1 && Number(lineStr) <= lines,
        `C0b: claimable '${id}' names ${rel}:${lineStr} but that file has ${lines} lines. The line `
        + 'is not graded exactly (it drifts on every edit above it) — only that it is inside the '
        + 'file, which a stale copy of a since-shrunk file is not.');
      ok(new RegExp(`\\b${symbol}\\b`).test(text),
        `C0b: claimable '${id}' names \`${symbol}\` in ${rel}, and that symbol is not in the file. `
        + 'It was renamed or removed and the registry still points at it.');
      seen.push(id);
    }
    ok(seen.length === Object.keys(rw.CLAIMABLES).length && seen.length >= 6,
      `C0b-CONTROL: ${seen.length} sites were read, and the registry has `
      + `${Object.keys(rw.CLAIMABLES).length} rows (expected at least the six claim-shaped grants). `
      + 'A reader that reads nothing is the decoration this assertion exists to end.');
    /* And the field is REQUIRED, which is the half of G4 that makes the reader
       load-bearing rather than opportunistic: an optional field read by a guard
       that skips absent ones is still a field nobody has to fill in. */
    ok(rw.CLAIMABLE_FIELDS.includes('site'),
      'C0b: `site` left CLAIMABLE_FIELDS. Either it is required AND read (what G4 asked for, and '
      + 'what this group provides), or it is neither — but a field this guard reads while the '
      + 'registry treats it as optional would fail on the first row that omits it.');
  }

  // ── C1. THE PARSER: A NAME, AND NOTHING ELSE ─────────────────────────────
  // The hostile body carries a period, an amount, a gold field and a poisoned
  // prototype. Every one of them must be inert BY CONSTRUCTION — parseIntent
  // builds a fresh null-prototype object field by field, so an unlisted key
  // cannot survive because no unlisted key is ever read.
  {
    const hostile = JSON.parse(JSON.stringify({
      verb: 'claim_reward', slot: 0, intentId: '11111111-1111-4111-8111-111111111111',
      reward: { kind: 'daily', key: 'login', period: '2020-1-1', amount: 1e9, gold: 1e9 },
      gold: 1e9, gems: 1e9, period: '2020-1-1', __proto__: { slot: 5 },
    }));
    const parsed = rq.parseIntent(hostile);
    ok(Object.getPrototypeOf(parsed) === null, 'C1: parseIntent returned an object with a prototype');
    ok(JSON.stringify(Object.keys(parsed).sort()) === JSON.stringify([...rq.INTENT_KEYS].sort()),
      `C1: parseIntent produced ${JSON.stringify(Object.keys(parsed))}, contract says ${JSON.stringify(rq.INTENT_KEYS)}`);
    ok(JSON.stringify(Object.keys(parsed.reward).sort()) === JSON.stringify(['key', 'kind']),
      `C1: the parsed reward is ${JSON.stringify(Object.keys(parsed.reward))} — it must be EXACTLY `
      + '{kind, key}. A `period` here is the one field that makes "claim every day since launch" '
      + 'a single loop.');
    ok(parsed.slot === 0, 'C1: a poisoned __proto__ moved the slot');
    // CONTROL: the parser is not simply nulling everything.
    ok(parsed.reward.kind === 'daily' && parsed.reward.key === 'login',
      'C1-CONTROL: the parser dropped a LEGITIMATE reward naming, so the assertions above pass '
      + 'for the wrong reason');
    ok(rq.readReward({ reward: { kind: 'not_a_kind', key: 'login' } }).kind === null,
      'C1: an unlisted progress kind was admitted');
    ok(rq.readReward({ reward: { kind: 'daily', key: 'HAS CAPS' } }).key === null,
      'C1: a malformed reward key was admitted');

    /* ── G2a (Security G2a, 2026-09-08) — THE HERO-SLOT ENTITLEMENT KEY IS
       UNREACHABLE THROUGH THE CLAIM PATH, ON BOTH SIDES. ──────────────────────
       hr_buy_hero_slot (2026-09-08-hero-slot-buy.sql) writes an ownership flag
       `character_slot:<n>`, and hr_apply's generic `progress` block WOULD accept
       `{kind:'flag', key:'character_slot:1'}` — 'flag' is an allowed reward kind.
       The one thing between a gem-priced entitlement and a free claim_reward is
       that the reward-KEY regex rejects a colon, on BOTH the edge parser
       (request.js REWARD_KEY_RE) and the client builder (src/net/gold.js
       REWARD_KEY_RE). Security accepted "closed twice" as sufficient and did NOT
       require the hr_apply refusal (that belt-and-suspenders is G2b, boarded
       separately) — but "closed twice" is a claim, and a claim about a money
       surface needs an assertion, so a future widening of either REWARD_KEY_RE to
       admit ns:id rewards goes RED by name and points at this block.
       The key is READ FROM ITS PRODUCER — the generated character_slot grant in
       src/data/shops.js, the exact string hr_buy_hero_slot writes — never typed,
       so the pin tracks the id shape rather than a literal (the fixture rule). */
    {
      const { pathToFileURL } = await import('node:url');
      const shops = await import(pathToFileURL(join(ROOT, 'src', 'data', 'shops.js')).href);
      const goldNet = await import(pathToFileURL(join(ROOT, 'src', 'net', 'gold.js')).href);
      const heroOffer = (shops.SHOP_OFFERS || []).find((o) => o.table === 'character_slot');
      ok(heroOffer && heroOffer.grant && heroOffer.grant[0],
        'G2a-FIXTURE: src/data/shops.js has no character_slot offer to read the entitlement key '
        + 'from — the pin has nothing producer-real to aim at');
      const heroKey = heroOffer.grant[0].id;                // e.g. 'character_slot:1'
      ok(/^character_slot:\d+$/.test(heroKey),
        `G2a-CONTROL: the hero-slot grant id is '${heroKey}', not the namespaced 'character_slot:<n>' `
        + 'shape hr_buy_hero_slot writes — the pin is aimed at the wrong string');
      const colonFree = heroKey.replace(/:/g, '_');         // the SAME key without the colon

      // EDGE — request.js REWARD_KEY_RE, exercised through the real parser.
      ok(rq.readReward({ reward: { kind: 'flag', key: heroKey } }).key === null,
        `G2a: the EDGE reward parser admitted the namespaced hero-slot key '${heroKey}'. hr_apply's `
        + 'generic progress block would then write it as an ownership flag — a gem-priced hero slot '
        + 'granted free through claim_reward. REWARD_KEY_RE (request.js) must reject the colon.');
      ok(rq.readReward({ reward: { kind: 'flag', key: colonFree } }).key === colonFree,
        `G2a-CONTROL: the edge parser also rejected the colon-FREE key '${colonFree}', so the `
        + 'assertion above proves nothing — it is rejecting everything, not the namespace');

      // CLIENT — src/net/gold.js REWARD_KEY_RE, the request builder half.
      ok(!goldNet.REWARD_KEY_RE.test(heroKey),
        `G2a: the CLIENT reward-key regex admitted '${heroKey}'. src/net/gold.js buildGoldRequest `
        + 'would put a namespaced entitlement key on the wire; the edge is the backstop, not the '
        + 'only lock, and both halves must reject it.');
      ok(goldNet.REWARD_KEY_RE.test(colonFree),
        `G2a-CONTROL: the client regex also rejected the colon-free '${colonFree}' — it is rejecting `
        + 'everything, so the assertion above is vacuous');

      // …and the ONE legitimate flag reward still passes BOTH locks, so the pin is
      // not merely "reject every flag key" (which would break the real claim).
      ok(rq.readReward({ reward: { kind: 'flag', key: 'renown_rank' } }).key === 'renown_rank'
         && goldNet.REWARD_KEY_RE.test('renown_rank'),
        'G2a-CONTROL: the real flag reward `renown_rank` (claimableFor\'s only flag member) is '
        + 'rejected too — the pin is too tight and would break the one legitimate flag claim');
    }
    ok(rq.VERBS.includes('claim_reward'), 'C1: claim_reward is not in the verb allowlist');
  }

  // ── C2. SHAPE AND REGISTRY REFUSALS COST ZERO DATABASE STATEMENTS ────────
  // The measurement is the STATEMENT COUNT. A refusal that reaches the database
  // lets a malformed client spend a real player's rate budget by looping on
  // garbage, which is the property this ordering exists to protect.
  {
    const probe = async (reward, intentId = uuid()) => {
      let stmts = 0;
      const counting = makeExec(db, { before: async () => { stmts++; } });
      const r = await cr.runClaimReward({ exec: counting, user: UID, slot: 0, intentId, reward });
      return { stmts, ...r };
    };
    const keyless = await probe(login(), null);
    ok(keyless.status === 400 && keyless.body.error === 'missing_intent_id' && keyless.stmts === 0,
      `C2: a keyless claim returned ${keyless.status} ${JSON.stringify(keyless.body)} after `
      + `${keyless.stmts} statement(s)`);

    for (const bad of [null, {}, { kind: 'daily', key: null }, { kind: null, key: 'login' }]) {
      const r = await probe(bad);
      ok(r.status === 400 && r.body.error === 'bad_reward' && r.stmts === 0,
        `C2: reward ${JSON.stringify(bad)} returned ${r.status} ${JSON.stringify(r.body)} after ${r.stmts} statement(s)`);
    }
    const unknown = await probe({ kind: 'daily', key: 'no_such_reward' });
    ok(unknown.status === 409 && unknown.body.error === 'unknown_reward' && unknown.stmts === 0,
      `C2: an unknown claimable returned ${unknown.status} ${JSON.stringify(unknown.body)} after ${unknown.stmts} statement(s)`);

    // BLOCKED — refused BY NAME, carrying its dependency.
    const blockedId = Object.keys(rw.CLAIMABLES).find((k) => rw.CLAIMABLES[k].status === 'blocked');
    const [bKind, bKey] = blockedId.split(':');
    const blocked = await probe({ kind: bKind, key: bKey });
    ok(blocked.status === 409 && blocked.body.error === 'reward_unavailable' && blocked.stmts === 0,
      `C2: a blocked claimable returned ${blocked.status} ${JSON.stringify(blocked.body)} after ${blocked.stmts} statement(s)`);
    /* THE REGISTRY'S OWN `needs`, VERBATIM — not merely "some prose". The build
       has a second, generic `needs` for "priced but no pricer", and a refusal
       that reaches THAT one has walked past the registry check: the reward looks
       refused, and the dependency the client renders is the wrong one. Only an
       equality assertion can tell the two refusals apart. */
    ok(blocked.body.needs === rw.CLAIMABLES[blockedId].needs,
      `C2: reward_unavailable carried needs=${JSON.stringify(blocked.body.needs)} but the registry `
      + `says ${JSON.stringify(rw.CLAIMABLES[blockedId].needs)}. Either the registry check was `
      + 'bypassed and this refusal came from somewhere else, or the dependency shown to the '
      + 'player is not the real one.');

    // ⚠ THE PROTOTYPE IDS. The key shape /^[a-z0-9_]{1,64}$/ matches both, both
    //   are truthy on a plain object, and the very next line reads `spec.status`.
    for (const id of ['constructor', '__proto__']) {
      const r = await probe({ kind: 'daily', key: id });
      ok(r.body.error === 'unknown_reward' && r.stmts === 0,
        `C2: claiming '${id}' returned ${JSON.stringify(r.body).slice(0, 160)} after ${r.stmts} `
        + 'statement(s) — it walked past the own-property guard');
    }
    // CONTROL: a genuinely unknown id costs the same nothing, so the count is
    // discriminating rather than always zero.
    const control = await probe({ kind: 'daily', key: 'definitely_not_a_reward' });
    ok(control.body.error === 'unknown_reward' && control.stmts === 0,
      'C2-CONTROL: the statement count is not discriminating');
  }

  // ── C3. NO CHARACTER ─────────────────────────────────────────────────────
  {
    await clearGate();
    const r = await call({ intentId: uuid(), reward: login() });
    ok(r.status === 409 && r.body.error === 'no_character',
      `C3: an empty slot returned ${r.status} ${JSON.stringify(r.body)}`);
    ok(!r.body.state, 'C3: a no_character refusal carried a state envelope — there is no state to send');
  }

  // Now give the player a character, the server's own way.
  let kitGold;
  {
    const r = (await db.query('select public.__a349_create($1,0) as v', [UID])).rows[0].v;
    ok(r.ok === true && r.created === true, `C3b: hr_create_character returned ${JSON.stringify(r)}`);
    kitGold = Number((await db.query('select gold from public.hr_start_kit')).rows[0].gold);
    ok(Number((await state(db, UID)).gold) === kitGold,
      'C3b-CONTROL: the fresh character does not hold the start kit\'s gold');
    ok((await progress(db, UID)).length === 0, 'C3b: a fresh character already has progress rows');
  }

  // ── C4. THE HAPPY PATH: the first claim, priced by the SERVER ────────────
  let day, prev, next, firstVersion;
  {
    await clearGate();
    const before = await state(db, UID);
    const keys = await dayKeys(db);
    day = keys.today; prev = keys.prev; next = keys.next;
    ok(day !== prev && day !== next && prev !== next,
      `C4-CONTROL: the three day keys are not distinct (${prev} / ${day} / ${next}) — every `
      + 'period assertion below would be vacuous');
    const expect = rw.priceDailyLogin(1);
    ok(expect.gold > 0, 'C4-CONTROL: day 1 of the cycle pays nothing, so "the gold moved" proves nothing');

    const r = await call({ intentId: uuid(), reward: login() });
    ok(r.status === 200 && r.body.ok === true,
      `C4: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);

    const st = await state(db, UID);
    ok(Number(st.gold) - Number(before.gold) === expect.gold,
      `C4: the claim paid ${Number(st.gold) - Number(before.gold)} gold, the catalogue says ${expect.gold}`);
    ok(Number(st.version) === Number(before.version) + 1,
      `C4: version ${before.version} -> ${st.version}, expected exactly one bump`);
    firstVersion = Number(st.version);

    // ⚠ THE WINDOW IS NOT CLOSED. hr_apply stamps accrued_to only on `equip` or
    //   `activity`; a claim carries neither, which is exactly why the registry
    //   says collectsFirst:false. If this ever fires, a claim has started eating
    //   the player's unpaid absence.
    ok(String(st.accrued_to) === String(before.accrued_to),
      `C4: a claim moved accrued_to (${before.accrued_to} -> ${st.accrued_to}) — it closed the `
      + 'accrual window and the elapsed absence was CONFISCATED. Either the delta gained a '
      + 'window-closing key or hr_apply\'s S5 stamp widened.');

    // THE RECEIPT, stated by the server.
    ok(r.body.granted && r.body.granted.gold === expect.gold,
      `C4: the receipt says ${JSON.stringify(r.body.granted)} but ${expect.gold} gold was paid`);
    ok(r.body.granted.streak === 1, `C4: the first claim reported streak ${r.body.granted.streak}`);
    ok(r.body.granted.period === day,
      `C4: the receipt names period '${r.body.granted.period}' but the server's day key is '${day}'`);
    ok(r.body.verb === 'claim_reward', 'C4: the body does not name its verb');

    /* THE RECEIPT'S LITERAL KEY SET (Security G3). `granted` is a DOCUMENTED
       WIRE SHAPE — claim-reward.js's header specifies it and the client renders
       it field by field — but its last four keys are SPREAD from the pricer's
       `meta`, so a pricer is free to rename a field the client reads without
       touching anything that looks like an interface. That is exactly what had
       happened: the header said `cycleDay,weeksDone` (and omitted `mult`) while
       the code emitted `cycle_day, weeks, mult`, so a client written from the
       documentation would have rendered three undefineds and nothing would have
       failed. Asserted EXACTLY, in both directions: a new key is a red build
       until the header names it, and a removed one is red until the client
       stops expecting it. */
    {
      const want = ['kind', 'key', 'period', 'gold', 'gems', 'streak', 'cycle_day', 'weeks', 'mult']
        .sort().join(',');
      const have = Object.keys(r.body.granted).sort().join(',');
      ok(have === want,
        `C4: granted's key set is [${have}], the contract is [${want}]. This object is what the `
        + 'client renders and what claim-reward.js\'s header promises; its tail is spread from the '
        + 'pricer\'s `meta`, so a rename there silently changes the wire. Move the header and this '
        + 'assertion together, or not at all.');
      /* And the header itself, read from the shipped bytes — the assertion above
         pins the code to a list in this file, which is only half of G3. The
         defect WAS a header that disagreed with the code, so the header is
         graded too, against the same list. */
      const hdr = await readFile(join(fnDir, 'claim-reward.js'), 'utf8');
      const line = /granted:\{([^}]*)\}/.exec(hdr);
      ok(!!line, 'C4: claim-reward.js\'s header no longer documents `granted:{…}` — the wire shape '
        + 'this test pins has stopped being written down anywhere a reader would look');
      const doc = line[1].split(',').map((s) => s.trim()).filter(Boolean).sort().join(',');
      ok(doc === want,
        `C4: claim-reward.js's header documents granted as [${doc}] but the server emits [${want}]. `
        + 'A client is written from the header. This is Security G3 — the code and the prose must '
        + 'name the same fields.');
    }

    // THE PROGRESS ROW — 'claimed', under the SERVER's period key.
    const rows = await progress(db, UID);
    ok(rows.length === 1, `C4: ${rows.length} progress rows, expected exactly 1`);
    ok(rows[0].kind === 'daily' && rows[0].key === 'login',
      `C4: the progress row is ${rows[0].kind}/${rows[0].key}`);
    ok(rows[0].period_key === day,
      `C4: the progress row is filed under '${rows[0].period_key}' but the server's day key is `
      + `'${day}'. A row under a period nothing looks up again is a silently unclaimable reward.`);
    ok(rows[0].state === 'claimed',
      `C4: the progress row is '${rows[0].state}', not 'claimed' — progress_claim did not run and `
      + 'the double-claim lock is not armed');
    ok(Number(rows[0].value) === 1, `C4: the row records streak ${rows[0].value}, expected 1`);

    // THE LEDGER — one row, the registry's kind, the budget stamped.
    const led = (await ledger(db, UID)).filter((x) => String(x.intent).startsWith('claim_reward'));
    ok(led.length === 1, `C4: ${led.length} claim ledger rows, expected 1`);
    ok(led[0].intent === `claim_reward:daily:login:${day}`,
      `C4: journal.intent is '${led[0].intent}' — it must name the reward AND the period, or one `
      + 'key reused on a later day is a silent no-op instead of intent_mismatch');
    ok(led[0].kind === rw.CLAIMABLES['daily:login'].ledgerKind,
      `C4: the ledger kind is '${led[0].kind}', the registry says '${rw.CLAIMABLES['daily:login'].ledgerKind}'`);
    ok(Number(led[0].gold_in) === expect.gold,
      `C4: the ledger stamped gold_in=${led[0].gold_in} but ${expect.gold} gold arrived — the daily `
      + 'budget would be charged the wrong amount');
  }

  // ── C5. ⚠ A CLAIM CAN BE MADE EXACTLY ONCE ──────────────────────────────
  // Fresh key, fresh version: an honest second click, not a replay. The refusal
  // must come from the database, under the character lock, and must roll the
  // `progress` write back with it.
  {
    await clearGate();
    const before = await state(db, UID);
    const r = await call({ intentId: uuid(), reward: login() });
    ok(r.status === 409 && r.body.error === 'not_claimable',
      `C5: THE REWARD CAN BE CLAIMED TWICE. The second claim returned ${r.status} `
      + `${JSON.stringify(r.body).slice(0, 300)} — expected not_claimable.`);
    ok(r.body.stage === 'claim', `C5: the refusal does not say which half failed (stage=${r.body.stage})`);
    const st = await state(db, UID);
    ok(Number(st.gold) === Number(before.gold),
      `C5: the refused claim still paid ${Number(st.gold) - Number(before.gold)} gold`);

    // ⚠ THE HALF NOBODY WOULD THINK TO CHECK. The losing call also proposed
    //   `add: <streak>`, and hr_apply's generic progress block ADDS to `value`.
    //   If the rejection did not roll that back, the row would read 2 and
    //   TOMORROW's streak would inherit the corruption — silently.
    const rows = await progress(db, UID);
    ok(rows.length === 1 && Number(rows[0].value) === 1,
      `C5: the refused claim left value=${rows[0] && rows[0].value} (expected 1). The rejection did `
      + 'not roll back the progress write, so tomorrow\'s streak is computed from a corrupted number.');

    // A REFUSAL THAT REACHED THE DATABASE CARRIES THE ENVELOPE (review C2), so
    // "reconcile the local state to what the envelope says" is executable here.
    ok(r.body.state && Number.isFinite(Number(r.body.version)),
      'C5: a not_claimable refusal carries NO state envelope, so the client cannot reconcile to '
      + 'anything but its own guess');
    ok(Number(r.body.version) === Number(st.version),
      `C5: the refusal's envelope reports version ${r.body.version} but the state is ${st.version}`);
  }

  // ── C6. A REPLAY APPLIES NOTHING AND RECEIPTS NOTHING ────────────────────
  {
    await clearGate();
    /* Manufacture "a new day": move the committed row's period back one day.
       Owner DML — the harness playing the part of a day passing, which no code
       path under test is allowed to do. The DAY KEYS are still the server's. */
    await db.query(
      'update public.player_progress set period_key = $3 '
      + 'where user_id = $1 and slot = 0 and kind = \'daily\' and key = \'login\' and period_key = $2',
      [UID, day, prev]);
    const key = uuid();
    const before = await state(db, UID);
    const first = await call({ intentId: key, reward: login() });
    ok(first.body.ok === true, `C6-CONTROL: the "next day" claim was refused: ${JSON.stringify(first.body).slice(0, 240)}`);
    const mid = await state(db, UID);
    const paid = Number(mid.gold) - Number(before.gold);
    ok(paid > 0, 'C6-CONTROL: the next-day claim paid nothing, so "a replay pays nothing" is vacuous');

    const replay = await call({ intentId: key, reward: login() });
    ok(replay.body.replayed === true,
      `C6: the same key was not treated as a replay: ${JSON.stringify(replay.body).slice(0, 240)}`);
    ok(replay.body.ok === true, 'C6: a replay must answer ok:true with fresh state');
    ok(Number((await state(db, UID)).gold) === Number(mid.gold),
      'C6: the replay applied the payment a second time');
    ok(replay.body.granted === null,
      `C6: a REPLAY reported granted=${JSON.stringify(replay.body.granted)}. THIS invocation applied `
      + 'nothing — one apply, unlike set_activity\'s two — so a receipt here is a bonus no renderer '
      + 'may invent. The fresh envelope already shows the money.');
  }

  // ── C7. THE STREAK IS THE SERVER'S, DERIVED FROM ITS OWN HISTORY ─────────
  {
    await clearGate();
    const rows = await progress(db, UID);
    const today = rows.find((x) => x.period_key === day);
    ok(today && Number(today.value) === 2,
      `C7: after claiming on two consecutive days the row records streak `
      + `${today && today.value}, expected 2 — the streak is not derived from yesterday's row`);

    // AND IT IS NOT THE CLIENT'S. There is no field for it, so the proof is that
    // the value came from the row: break the row's STATE and the streak resets.
    await db.query(
      "update public.player_progress set state = 'done', period_key = $3 "
      + "where user_id = $1 and slot = 0 and kind = 'daily' and key = 'login' and period_key = $2",
      [UID, prev, 'sentinel']);
    await db.query(
      'update public.player_progress set period_key = $3 '
      + "where user_id = $1 and slot = 0 and kind = 'daily' and key = 'login' and period_key = $2",
      [UID, day, prev]);
    await db.query(
      "delete from public.player_progress where user_id = $1 and period_key = 'sentinel'", [UID]);
    // Yesterday is now a 'claimed' row with value 2 -> today should pay day 3.
    const expect3 = rw.priceDailyLogin(3);
    const before = await state(db, UID);
    const r = await call({ intentId: uuid(), reward: login() });
    ok(r.body.ok === true, `C7: the third-day claim was refused: ${JSON.stringify(r.body).slice(0, 240)}`);
    ok(r.body.granted.streak === 3,
      `C7: the third consecutive day reported streak ${r.body.granted.streak}, expected 3`);
    ok(Number((await state(db, UID)).gold) - Number(before.gold) === expect3.gold,
      `C7: day 3 paid ${Number((await state(db, UID)).gold) - Number(before.gold)}, the catalogue `
      + `says ${expect3.gold}`);
    ok(expect3.gold !== rw.priceDailyLogin(1).gold,
      'C7-CONTROL: day 3 and day 1 pay the same, so the streak assertion above is vacuous');
    ok(r.body.granted.gems === expect3.gems,
      `C7: day 3 granted ${r.body.granted.gems} gems, the catalogue says ${expect3.gems}`);
  }

  // ── C8. A BROKEN STREAK RESETS, AND AN UNCLAIMED ROW IS NOT A STREAK ─────
  {
    await clearGate();
    // Yesterday exists but was never CLAIMED. That is not a streak.
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    await db.query(
      "insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) "
      + "values ($1, 0, 'daily', 'login', $2, 9, 'done')", [UID, prev]);
    const before = await state(db, UID);
    const r = await call({ intentId: uuid(), reward: login() });
    ok(r.body.ok === true, `C8: the claim was refused: ${JSON.stringify(r.body).slice(0, 240)}`);
    ok(r.body.granted.streak === 1,
      `C8: an unclaimed yesterday row (value 9, state 'done') produced streak `
      + `${r.body.granted.streak}. Only a CLAIMED row continues a streak — otherwise any row `
      + 'anything ever writes under that key inflates the reward.');
    ok(Number((await state(db, UID)).gold) - Number(before.gold) === rw.priceDailyLogin(1).gold,
      'C8: the reset streak did not pay day 1');
  }

  // ── C8b. A TODAY-ROW THIS ENGINE DID NOT WRITE IS REFUSED ───────────────
  // hr_apply CANNOT catch this one, and that is why it is here. From its side a
  // 'done' row being claimed is a well-formed claim of something earned — which
  // is exactly what progress_claim is built to honour. But this engine only ever
  // writes a daily:login row as part of an atomic claim, so a 'done' row is a
  // state it did not create and cannot interpret, and the generic progress block
  // would ADD to its unknown `value`, claim it, and pay for it. The edge check is
  // the only thing standing there.
  {
    await clearGate();
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    await db.query(
      "insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) "
      + "values ($1, 0, 'daily', 'login', $2, 4242, 'done')", [UID, day]);
    const before = await state(db, UID);
    const r = await call({ intentId: uuid(), reward: login() });
    ok(r.body.ok === false && r.body.error === 'not_claimable',
      `C8b: a 'done' today-row this engine never wrote was ADMITTED (${JSON.stringify(r.body).slice(0, 240)}). `
      + 'hr_apply would flip it to claimed and pay for it, with value 4242 + streak carried into '
      + 'tomorrow\'s streak.');
    ok(Number((await state(db, UID)).gold) === Number(before.gold), 'C8b: the refused claim paid gold');
    const rows = await progress(db, UID);
    ok(rows.length === 1 && Number(rows[0].value) === 4242 && rows[0].state === 'done',
      `C8b: the foreign row was mutated (${JSON.stringify(rows[0])})`);
    // CONTROL: with the row gone, the same call succeeds — so the refusal above
    // is about the row and not about something else in the fixture.
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    const control = await call({ intentId: uuid(), reward: login() });
    ok(control.body.ok === true,
      `C8b-CONTROL: the claim fails even with no row at all (${JSON.stringify(control.body).slice(0, 200)})`);
  }

  // ── C9. ONE KEY REUSED ON A LATER DAY IS LOUD, NOT SILENT ───────────────
  // The period is part of `journal.intent`, so hr_apply's intent_mismatch fires.
  // Without it, Tuesday's claim under Monday's key answers `replayed: true,
  // ok: true` and pays NOTHING — a correctness trap with no error anywhere, for
  // a reward the player genuinely earned.
  //
  // ⚠ TOMORROW IS INJECTED, NOT WAITED FOR. PGlite has one clock and no way to
  //   move it, so the `after` hook shifts `hr_claim_lookup`'s OWN answer forward
  //   one day — today becomes `next`, yesterday becomes `day`, and today's row
  //   drops out of the window exactly as the real query would drop it. The day
  //   keys are still the SERVER's (read back out of hr_utc_day_key); what is
  //   simulated is the passage of time, which is the one thing this harness
  //   cannot do for real.
  {
    await clearGate();
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    const key = uuid();
    const first = await call({ intentId: key, reward: login() });
    ok(first.body.ok === true, `C9-CONTROL: the first claim failed: ${JSON.stringify(first.body).slice(0, 240)}`);
    ok(first.body.granted.period === day, 'C9-CONTROL: the first claim was not filed under today');

    const tomorrow = (rows, text) => {
      if (!text.includes('hr_claim_lookup')) return undefined;
      const r = rows[0];
      if (!r || !r.lookup) return undefined;
      const was = r.lookup.rows || {};
      r.lookup = {
        today: next,
        prev: day,
        /* Today's row is now yesterday's; `next` has none. Same shape the real
           query would return once the clock rolls over. */
        rows: Object.prototype.hasOwnProperty.call(was, day) ? { [day]: was[day] } : {},
      };
      return rows;
    };
    const later = makeExec(db, { after: tomorrow });
    const before = await state(db, UID);
    const again = await cr.runClaimReward({
      exec: later, user: UID, slot: 0, intentId: key, reward: login(),
    });
    ok(again.body.ok === false && again.body.error === 'intent_mismatch',
      `C9: reusing Monday's key on Tuesday returned ${JSON.stringify(again.body).slice(0, 240)} — `
      + 'expected intent_mismatch. If this says replayed:true the player earned a reward and was '
      + 'paid nothing, silently.');
    ok(Number((await state(db, UID)).gold) === Number(before.gold), 'C9: the mismatched call moved gold');

    // ...and a FRESH key on the same simulated tomorrow SUCCEEDS, which is the
    // contract's own recovery ("a rejected intent is retried with a NEW key").
    // Without this control the refusal above could be about anything.
    const fresh = await cr.runClaimReward({
      exec: makeExec(db, { after: tomorrow }), user: UID, slot: 0, intentId: uuid(), reward: login(),
    });
    ok(fresh.body.ok === true,
      `C9-CONTROL: a fresh key was refused too (${JSON.stringify(fresh.body).slice(0, 200)}) — the `
      + 'refusal above would then be about something other than the key');
    ok(fresh.body.granted.period === next && fresh.body.granted.streak === 2,
      `C9-CONTROL: tomorrow's claim reported ${JSON.stringify(fresh.body.granted)} — expected `
      + `period ${next} and streak 2`);
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
  }

  // ── C10. A STALE VERSION IS REFUSED, WITH AN ENVELOPE ───────────────────
  {
    await clearGate();
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    const before = await state(db, UID);
    /* Inject the state a concurrent writer leaves behind, at exactly the point a
       race would produce it: the version the intent read is stale by the time it
       applies. A FAULT INJECTION, not a race — PGlite is one backend. */
    const racing = makeExec(db, {
      before: async (text) => {
        if (text.includes('hr_apply')) {
          await db.query(
            'update public.player_state set version = version + 1 where user_id = $1 and slot = 0', [UID]);
        }
      },
    });
    const r = await cr.runClaimReward({
      exec: racing, user: UID, slot: 0, intentId: uuid(), reward: login(),
    });
    ok(r.status === 409 && r.body.error === 'version_conflict',
      `C10: a stale version returned ${JSON.stringify(r.body).slice(0, 240)}`);
    ok(r.body.state && Number(r.body.version) === Number(before.version) + 1,
      `C10: the refusal's envelope is stale or missing (version ${r.body.version})`);
    ok((await progress(db, UID)).length === 0,
      'C10: the refused claim still wrote a progress row — the protected block did not roll back');
  }

  // ── C11. THE RATE GATE ───────────────────────────────────────────────────
  {
    await clearGate();
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    ok(it.rateBucketFor('claim_reward') === 'claim',
      `C11: the registry names bucket '${it.rateBucketFor('claim_reward')}'`);
    let refused = 0; let allowed = 0;
    for (let i = 0; i < 30; i++) {
      const r = await call({ intentId: uuid(), reward: login() });
      if (r.status === 429) refused++; else allowed++;
    }
    ok(refused > 0, `C11: 30 claims in one minute produced ${refused} refusals — the gate is not applied`);
    ok(allowed > 0, 'C11-CONTROL: every call was refused, so the gate is not discriminating');
    ok(allowed <= 20,
      `C11: ${allowed} of 30 claims were admitted — the claim bucket is meant to be 20/min, `
      + 'tighter than accrue\'s 30 (see 2026-08-16-claim-reward.sql §2)');
    // ...and the ACCRUE budget is untouched, so exhausting one bucket cannot
    // take away time from a player's absence.
    const [g] = await exec(
      'select public.hr_rate_gate($1::uuid, 0, $2::text) as allowed', [UID, 'accrue']);
    ok(g.allowed === true, 'C11: exhausting the claim bucket also exhausted accrue');
  }

  // ── C12. THE MULTIPLIER IS BOUNDED ──────────────────────────────────────
  // The client has been paying `1 + weeksDone * 0.5` with no cap: a two-year
  // perfect streak is x53, i.e. 1,060,000 gold from one day-7 claim. A server
  // that authorises a payout may not propose an unbounded number.
  {
    const far = rw.priceDailyLogin(7 * 500);          // ~9.6 years
    ok(far.mult <= rw.DAILY_LOGIN_MAX_WEEK_MULT,
      `C12: a 3,500-day streak proposes a x${far.mult} multiplier — the cap is not applied`);
    const cap = rw.DAILY_LOGIN_CYCLE.reduce((m, r) => Math.max(m, r.gold || 0), 0)
      * rw.DAILY_LOGIN_MAX_WEEK_MULT;
    ok(far.gold <= cap, `C12: a far-future claim proposes ${far.gold} gold, above the capped ceiling ${cap}`);
    // CONTROL: the cap is not simply flattening everything to x1.
    ok(rw.priceDailyLogin(8).gold > rw.priceDailyLogin(1).gold,
      'C12-CONTROL: week 2 pays the same as week 1, so the cap assertion is vacuous');
    ok(rw.priceDailyLogin(1).gold === rw.DAILY_LOGIN_CYCLE[0].gold,
      'C12-CONTROL: day 1 does not pay the cycle\'s first entry');
  }

  // ── C13. THE WINDOW-CLOSING CHECK IS ARMED ──────────────────────────────
  // `collectsFirst:false` is only correct while the delta cannot stamp
  // accrued_to. That is a fact about a DELTA, so it is checked rather than
  // asserted — and the list it checks against has to be read.
  {
    ok(it.collectsFirst('claim_reward') === false,
      'C13: the registry says a claim collects first — it carries no window-closing key, so that '
      + 'would be a round trip that buys nothing');
    ok(it.deltaClosesWindow({ activity: { kind: 'idle' } }) === true,
      'C13: deltaClosesWindow does not recognise `activity` — the fail-closed check can never fire');
    ok(it.deltaClosesWindow({ equip: {} }) === true,
      'C13: deltaClosesWindow does not recognise `equip`');
    ok(it.deltaClosesWindow({ gold: 1, progress: [] }) === false,
      'C13-CONTROL: deltaClosesWindow reports a plain claim delta as window-closing, so every '
      + 'claim would refuse');
    const spec = rw.CLAIMABLES['daily:login'];
    const d = cr.claimDelta({
      kind: 'daily', key: 'login', spec, period: day,
      priced: { gold: 1, gems: 0, add: 1, meta: {} },
    });
    ok(it.deltaClosesWindow(d) === false,
      `C13: a real claim delta closes the accrual window (keys: ${Object.keys(d)}) — with `
      + 'collectsFirst:false that silently confiscates the player\'s unpaid absence');
    ok(d.journal.intent === `claim_reward:daily:login:${day}`,
      `C13: the delta's journal.intent is '${d.journal.intent}'`);
    ok(!('gems' in d), 'C13: a zero gem grant is sent as gems:0 rather than omitted');
  }

  // ── C13b. THE REGISTRY IS READ, NOT DECORATION (review C4) ──────────────
  // A bucket LITERAL at the gate call site is behaviourally identical today, so
  // only a source assertion can see it — which is the whole point: the day the
  // registry says one thing and the call site spends another, nothing fails.
  {
    const src = (await readFile(join(fnDir, 'claim-reward.js'), 'utf8'))
      .replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const at = src.indexOf('hr_rate_gate(');
    ok(at >= 0, 'C13b-CONTROL: no hr_rate_gate call site in claim-reward.js — the scan is blind');
    /* The gate is named in SQL, so the literal to look for is in the ARGUMENT
       LIST of the exec() call that carries READ_SQL, not inside the SQL text. */
    const call2 = src.indexOf('exec(READ_SQL');
    ok(call2 >= 0, 'C13b-CONTROL: no exec(READ_SQL) call site — the scan is blind');
    let d = 0; let end = -1;
    for (let i = src.indexOf('[', call2); i < src.length; i++) {
      if (src[i] === '[') d++;
      else if (src[i] === ']') { d--; if (d === 0) { end = i; break; } }
    }
    const args = src.slice(src.indexOf('[', call2), end + 1).replace(/rateBucketFor\([^)]*\)/g, 'REGISTRY');
    ok(!/['"]/.test(args),
      `C13b: claim-reward.js names a rate bucket as a LITERAL at the gate (${args.trim().slice(0, 140)}). `
      + 'A literal at a call site is a second registry.');
    ok(/rateBucketFor\(/.test(src),
      'C13b: claim-reward.js gates but never calls rateBucketFor — the value it passes came from '
      + 'somewhere other than the registry');
    // ...and every verb the parser admits has a registry row.
    const verbs = [...rq.VERBS].sort().join(',');
    const rows = Object.keys(it.INTENT_REGISTRY).sort().join(',');
    ok(verbs === rows,
      `C13b: request.js accepts [${verbs}] but the registry describes [${rows}]`);
  }

  /* ── C13e. THE PERIOD GATE IS SHARED, AND IT COVERS '' (Security G6) ─────
     THE FINDING: the fail-closed "a row for this period exists in a state this
     engine did not write" check lived INSIDE priceLoginClaim. Two consequences,
     and the second is the one that would have cost money:

       (a) PRICER #2 WOULD NOT HAVE INHERITED IT. Pricer #1 was written by
           copying set-activity.js; pricer #2 will be written by copying pricer
           #1, and what gets copied is the arithmetic, not the guard buried
           under it. Now the gate runs in runClaimReward BEFORE any pricer, so a
           pricer inherits it by not being called until it has passed.
       (b) IT ONLY EVER CHECKED `today`. Four of the six registry rows are
           `periodic:false` and file under the PERMANENT key '' — and '' is
           returned by hr_claim_lookup precisely so it can be checked. A foreign
           row matters MOST there: there is no tomorrow to recover into, so
           compounding an unknown value into a permanent row and paying for it
           is unrecoverable rather than wrong for a day.

     Unit-level, deliberately: the only PRICED claimable today is periodic, so
     the '' path cannot be driven end to end without inventing a claimable the
     server does not have. Inventing one would test the fixture. The behavioural
     end-to-end proof of the periodic half is C4/C5/C8; this is the proof that
     the SAME code answers for '' the day a one-off claimable is priced. */
  {
    const periodic = Object.freeze({ status: 'priced', periodic: true, ledgerKind: 'quest' });
    const oneOff = Object.freeze({ status: 'priced', periodic: false, ledgerKind: 'quest' });

    ok(typeof cr.resolveClaimPeriod === 'function',
      'C13e: claim-reward.js exports no resolveClaimPeriod — the gate is not shared, so pricer #2 '
      + 'has to remember to copy it');

    // (1) A PERIODIC claimable with no server day is refused, never filed under ''.
    const noDay = cr.resolveClaimPeriod({ spec: periodic, lookup: { today: '', rows: {} } });
    ok(noDay.error === 'reward_unavailable',
      `C13e: a periodic claim with no server day key answered ${JSON.stringify(noDay)}. Filing it `
      + "under '' writes a PERMANENT row for a DAILY reward — the player's login reward ends "
      + 'forever, silently.');

    // (2) The periodic happy path still resolves to the server's day.
    const okDay = cr.resolveClaimPeriod({ spec: periodic, lookup: { today: day, rows: {} } });
    ok(okDay.period === day && !okDay.error,
      `C13e-CONTROL: the periodic happy path answered ${JSON.stringify(okDay)} — if the gate refuses `
      + 'everything, the refusals above prove nothing');

    // (3) A foreign TODAY row is refused; a 'claimed' one falls through to hr_apply.
    const foreignToday = cr.resolveClaimPeriod({
      spec: periodic, lookup: { today: day, rows: { [day]: { value: 9, state: 'done' } } } });
    ok(foreignToday.error === 'not_claimable',
      `C13e: a 'done' today-row this engine did not write was ADMITTED (${JSON.stringify(foreignToday)}). `
      + "hr_apply cannot catch it — from its side it is a well-formed claim of a 'done' row.");
    const claimedToday = cr.resolveClaimPeriod({
      spec: periodic, lookup: { today: day, rows: { [day]: { value: 1, state: 'claimed' } } } });
    ok(claimedToday.period === day && !claimedToday.error,
      `C13e: a 'claimed' today-row was intercepted here (${JSON.stringify(claimedToday)}). Only `
      + 'hr_apply holds player_intents, so only hr_apply can tell a REPLAY from an honest second '
      + 'click — intercepting it is review C5 again: money in the envelope, receipt gone.');

    // (4) THE NEW COVERAGE. A NON-PERIODIC claimable files under '' and is
    //     gated there by the same code.
    const empty = cr.resolveClaimPeriod({ spec: oneOff, lookup: { today: day, rows: {} } });
    ok(empty.period === '' && !empty.error,
      `C13e: a non-periodic claimable resolved to ${JSON.stringify(empty)} — it must file under the `
      + "permanent key '', not under today, or a one-off reward becomes claimable once a day");
    const foreignEmpty = cr.resolveClaimPeriod({
      spec: oneOff, lookup: { today: day, rows: { '': { value: 400, state: 'active' } } } });
    ok(foreignEmpty.error === 'not_claimable',
      `C13e: a foreign '' row was ADMITTED for a non-periodic claimable (${JSON.stringify(foreignEmpty)}). `
      + "This is the '' half of G6: the pre-fix check only ever looked at `today`, so every one-off "
      + 'claimable would have compounded an unknown value into a PERMANENT row and paid for it.');
    const claimedEmpty = cr.resolveClaimPeriod({
      spec: oneOff, lookup: { today: day, rows: { '': { value: 1, state: 'claimed' } } } });
    ok(claimedEmpty.period === '' && !claimedEmpty.error,
      `C13e: a claimed '' row was intercepted (${JSON.stringify(claimedEmpty)}) — the replay rule is `
      + 'the same for a one-off claim as for a daily one');

    /* (5) THE GATE RUNS BEFORE THE PRICER, read from the source. Behaviourally
           identical today, because priceLoginClaim ALSO calls it belt-and-braces
           — which is exactly why only a source assertion can see the day
           runClaimReward stops running it and pricer #2 (which will not have
           copied it) is admitted ungated. */
    const src = (await readFile(join(fnDir, 'claim-reward.js'), 'utf8'))
      .replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    const body = src.slice(src.indexOf('export async function runClaimReward'));
    ok(body.length > 0, 'C13e-CONTROL: runClaimReward not found in the source — the scan is blind');
    const atGate = body.indexOf('resolveClaimPeriod(');
    const atPricer = body.indexOf('pricer({');
    ok(atGate >= 0,
      'C13e: runClaimReward never calls resolveClaimPeriod. The shared gate is then only whatever '
      + 'each pricer remembered to call itself, which is the arrangement G6 was raised about.');
    ok(atPricer >= 0, 'C13e-CONTROL: runClaimReward never calls its pricer — the scan is blind');
    ok(atGate < atPricer,
      'C13e: runClaimReward calls its pricer BEFORE the shared period gate. A pricer must not be '
      + 'reachable until the gate has passed — that is the whole of "inherited structurally".');
    ok(/period:\s*gate\.period/.test(body),
      'C13e: the delta no longer takes its period from the gate. The gate decides which period is '
      + 'CHECKED for a foreign row; if the delta WRITES a different one, the check guards a period '
      + 'nothing writes to.');
  }

  // ── C13c. hr_claim_lookup IS BOUNDED BY CONSTRUCTION ────────────────────
  // Three period keys — '', today, yesterday — and there is no argument through
  // which a caller could widen it. Without the bound, one call scans a
  // character's whole claim history, which is unbounded in the one table that
  // mints a row per claimable per period forever.
  {
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    for (const p of ['2020-1-1', '2020-1-2', '2020-1-3', '2019-6-6', prev, day, '']) {
      await db.query(
        "insert into public.player_progress (user_id, slot, kind, key, period_key, value, state) "
        + "values ($1, 0, 'daily', 'login', $2, 1, 'claimed') "
        + 'on conflict (user_id, slot, kind, key, period_key) do nothing', [UID, p]);
    }
    const total = (await progress(db, UID)).length;
    ok(total === 7, `C13c-CONTROL: the fixture wrote ${total} rows, expected 7 — the bound below `
      + 'would then be measuring nothing');
    const [row] = await exec(
      'select public.hr_claim_lookup($1::uuid, 0, $2::text, $3::text) as lookup',
      [UID, 'daily', 'login']);
    const got = Object.keys(row.lookup.rows).sort();
    ok(got.length <= 3,
      `C13c: hr_claim_lookup returned ${got.length} period rows (${got}) out of ${total} — it is `
      + 'not bounded, so one claim scans the character\'s whole history');
    ok(got.join(',') === ['', prev, day].sort().join(','),
      `C13c: hr_claim_lookup returned ${JSON.stringify(got)}, expected exactly ['', '${prev}', '${day}']`);
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
  }

  // ── C13d. THE TWO DAY-KEY IMPLEMENTATIONS AGREE, ACROSS LANGUAGES ───────
  // There are already two: `public.hr_utc_day_key(timestamptz)` (clan-seat,
  // 2026-08-08) and `utcDayKey` in src/core/botd.js, which world-events and
  // raids have used for months. This slice deliberately did NOT add a third —
  // a JS helper returning '20260805' against SQL's '2026-8-5' would not be a
  // duplicate that MIGHT drift, it would be one that is already different, and
  // the only symptom is a player_progress row filed under a period nothing
  // looks up again.
  //
  // A FIXED timestamp, never `now()`: comparing two clocks at midnight UTC is a
  // test that fails once a day for no reason, and a test that cries wolf is one
  // people learn to skip.
  {
    const { utcDayKey } = await import(
      (await import('node:url')).pathToFileURL(join(ROOT, 'src', 'core', 'botd.js')).href);
    /* AS THE OWNER, not through `exec`. `hr_engine` deliberately holds NO
       execute on hr_utc_day_key — asserted below — and hr_claim_lookup reaches
       it as a SECURITY DEFINER instead. Found by the harness: routing this probe
       through the engine role returned "permission denied", which is the grant
       matrix working, not a broken test. */
    const key = async (iso) => (await db.query(
      'select public.hr_utc_day_key($1::timestamptz) as k', [iso])).rows[0].k;
    for (const iso of ['2026-08-05T12:00:00Z', '2026-12-31T23:59:59Z', '2026-01-01T00:00:00Z']) {
      const k = await key(iso);
      ok(k === utcDayKey(Date.parse(iso)),
        `C13d: at ${iso} Postgres says '${k}' and src/core/botd.js says `
        + `'${utcDayKey(Date.parse(iso))}'. Two day-key formats means a period key one half `
        + 'writes and the other can never look up.');
    }
    // CONTROL: the comparison is discriminating rather than both-null.
    ok(await key('2026-08-05T12:00:00Z') !== utcDayKey(Date.parse('2026-08-06T12:00:00Z')),
      'C13d-CONTROL: the day key is the same on two different days — it is not a day key');

    /* AND THE ENGINE STILL CANNOT NAME A DAY ITSELF. The whole design rests on
       the period arriving from Postgres; an engine that could call the day
       function directly could also compute yesterday's key and file a claim
       under it. The definer indirection is the grant, and this asserts nobody
       widened it to make the probe above easier. */
    const [g] = (await db.query(
      "select has_function_privilege('hr_engine', "
      + "'public.hr_utc_day_key(timestamptz)', 'execute') as ok")).rows;
    ok(g.ok === false,
      'C13d: hr_engine can execute hr_utc_day_key directly — the Edge Function could then derive '
      + 'any day it liked instead of being handed one');
  }

  // ── C14. ANOTHER PLAYER'S CLAIM IS NOT REACHABLE ────────────────────────
  // `slot` is the only request-derived value that reaches a query and it selects
  // a row the caller already owns; the identity is the verified JWT subject and
  // there is no field for it. This asserts the consequence rather than the code.
  {
    await clearGate();
    const r = (await db.query('select public.__a349_create($1,0) as v', [UID2])).rows[0].v;
    ok(r.created === true, `C14-CONTROL: could not create the second character: ${JSON.stringify(r)}`);
    const before2 = Number((await state(db, UID2)).gold);
    await db.query('delete from public.player_progress where user_id = $1', [UID]);
    const out = await call({ intentId: uuid(), reward: login() });
    ok(out.body.ok === true, `C14-CONTROL: the claim failed: ${JSON.stringify(out.body).slice(0, 200)}`);
    ok(Number((await state(db, UID2)).gold) === before2,
      'C14: claiming as one player moved another player\'s gold');
    ok((await progress(db, UID2)).length === 0,
      'C14: claiming as one player wrote a progress row for another');
  }

  await db.close();
  return fails;
}

// ── driver ──────────────────────────────────────────────────────────────
(async () => {
  if (has('list')) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id.padEnd(26)} ${m.why}`);
    process.exit(0);
  }

  const one = argOf('mutate', null);
  if (one) {
    let red = false; let why = '';
    try { const f = await run(one); red = f.length > 0; why = f[0] || ''; }
    catch (e) { if (e.harness) { console.error(e.message); process.exit(2); } red = true; why = e.message; }
    console.log(`${one}: ${red ? 'CAUGHT' : 'SLIPPED'}${red ? ` — ${why.slice(0, 200)}` : ''}`);
    process.exit(red ? 0 : 1);
  }

  let clean = [];
  try { clean = await run(null); }
  catch (e) {
    if (e.harness) { console.error(e.message); process.exit(2); }
    if (!(e instanceof Red)) { console.error(e.stack || e.message); process.exit(2); }
    clean = fails.length ? fails : [e.message];
  }
  if (clean.length) {
    console.log('claim-intent: RED');
    for (const f of clean) console.log('  ✗ ' + f);
    process.exit(1);
  }
  console.log('claim-intent: OK — claim-once, server price, server period, server streak, replay '
    + 'receipts nothing, key reuse across days is loud, stale version, rate gate, capped '
    + 'multiplier, window-closing check, cross-player isolation, the receipt\'s literal key set, '
    + 'the registry\'s sites resolve, the shared period gate covers \'\' (15 groups + 6 sub-groups, '
    + 'real PG18 + the deployed intent module)');

  if (has('selftest')) {
    let slipped = 0; let unplantable = 0;
    for (const id of Object.keys(MUTATIONS)) {
      let red = false; let why = ''; let harness = false;
      try { const f = await run(id); red = f.length > 0; why = f[0] || ''; }
      catch (e) {
        /* ⚠ A MUTATION THAT CANNOT BE PLANTED IS RECORDED, AND THE RUN GOES ON.
           This used to process.exit(2) from inside the loop, so ONE stale anchor
           hid every mutation declared after it. When deriveLoginStreak moved out
           of claim-reward.js into src/data/rewards.js (4cc7d6cd), this file
           printed eight CAUGHT lines and stopped: the twenty mutations after
           streak_ignores_state were never run at all, for days, and the only
           evidence was one line at the bottom of a CI log nobody was reading.
           The verdict is NOT weakened — an unplantable mutation is never a catch
           and is still fatal (exit 2, below) — but the whole catalogue's state
           now comes out of ONE run, which is the difference between fixing one
           anchor a day and fixing them all in one commit. Same rule, and the
           same reason, as tests/conservation-fuzz.mjs' selftest driver. */
        if (e.harness) { harness = true; why = e.message; }
        else { red = true; why = e.message; }
      }
      if (harness) {
        console.log(`  HARNESS ${id.padEnd(26)} ${why.slice(0, 110)}`);
        unplantable++;
        continue;
      }
      console.log(`  ${red ? 'CAUGHT ' : 'SLIPPED'} ${id.padEnd(26)} ${red ? why.slice(0, 110) : MUTATIONS[id].why}`);
      if (!red) slipped++;
    }
    if (unplantable) {
      console.log(`\n${unplantable} mutation(s) could not be PLANTED — a stale anchor proves nothing. `
        + 'Re-point each one at the file its code lives in now.');
      process.exit(2);
    }
    if (slipped) { console.log(`\n${slipped} mutation(s) SLIPPED — the guard cannot see them.`); process.exit(1); }
    console.log(`\nall ${Object.keys(MUTATIONS).length} mutations CAUGHT.`);
  }
})();
