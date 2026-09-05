#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bounty-hunter-xp.mjs — THE BOUNTY-HUNTER XP CREDIT, GRADED AGAINST
//                              REAL POSTGRESQL AND THE REAL CLIENT MODULES.
//
//   node tests/bounty-hunter-xp.mjs             # the guard
//   node tests/bounty-hunter-xp.mjs --list      # the mutation catalogue
//   node tests/bounty-hunter-xp.mjs --selftest  # every mutation must be CAUGHT
//   node tests/bounty-hunter-xp.mjs --mutate=<id>
//
// Ships with: supabase/migrations/2026-09-11-bounty-hunter-xp.sql
//             src/core/bounty.js        (boardTierForBountyLevel)
//             src/legacy.js             (the client stops authoring the xp)
//             src/net/client-state.js   (hydrateInto drops the residue mirror)
//             src/net/capstone.js       (buildResiduePatch drops it too)
//
// ── THE DEFECT THIS EXISTS FOR (P0, playerbase-wide) ────────────────────
// Measured on production 2026-09-05:
//     select count(*), count(distinct user_id), max(xp)
//       from player_skills where skill_id='bountyHunter';
//     -> 36 rows, 34 players, max_xp = 0
// Not one character had ever held a point of Bounty-Hunter XP. The row is
// seeded by hr_create_character and NO SERVER CODE EVER CREDITED IT; the CLIENT
// computed it into `G.skills.bountyHunter`, which is SERVER_OF_RECORD, so
// applyRecord's wholesale `G.skills = <server map>` put the seeded 0 back after
// every envelope. `getUnlockedBountyTier` is keyed off that level (Lv20 -> tier
// 2 ... Lv60 -> tier 6), so EVERY BOARD TIER ABOVE 1 WAS UNREACHABLE FOR THE
// ENTIRE PLAYERBASE, permanently.
//
// ── WHAT THIS FILE DRIVES ───────────────────────────────────────────────
// BOTH HALVES OF THE ROUND TRIP, because either one alone would have passed
// while the game stayed broken:
//   · SERVER — the REAL migration chain from tests/schema-apply-order.json,
//     applied verbatim into PGlite (real PostgreSQL, in process), then a real
//     character through the REAL rate-gated hr_accept_bounty / hr_claim_bounty
//     as `authenticated` with a JWT subject set.
//   · CLIENT — the REAL src/net/record.js applyRecord fed the REAL hr_state_of
//     envelope that database produces, then the level read through the REAL
//     src/net/skill-record.js display accessor. BHX-7 is the assertion the old
//     code could never have passed: it is the envelope round trip that used to
//     reset the level to 1.
//   · AND THE GATE — src/core/bounty.js boardTierForBountyLevel, at the level
//     the server actually credits its way to. BHX-8 grinds REAL turn-ins until
//     the SERVER's own hr_level_from_xp reaches 20 and then asserts tier 2.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · TRUE CONCURRENCY. PGlite is one backend, so the `select ... for update`
//     on active_bounty is exercised serially. The once-guard is exercised as a
//     REPLAY (BHX-3), which is the shape a retry actually takes.
//   · The pooler, PostgREST and the JWT itself.
//   · Production's ACL — the migration's own §2(d) asserts it at apply time and
//     BHX-10 asserts it on the replayed database.
//   · The BROWSER: that legacy.js's finalizeBounty predicts the returned xp and
//     paints the toast. That is the in-page suite's and the play gate's job.
//     What IS proven here is the contract they depend on — that the receipt
//     carries `xp_skill` (BHX-6), which is the key the client branches on.
// ════════════════════════════════════════════════════════════════════════
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { bootReplay } from './schema-replay.mjs';

const MIG = '2026-09-11-bounty-hunter-xp.sql';
const SRC = (p) => new URL('../src/' + p, import.meta.url).href;

/* ── THE MUTATION CATALOGUE ─────────────────────────────────────────────
   Each is a defect somebody could plausibly write, and each must turn this
   guard RED. A guard that cannot demonstrate it sees failure is broken, not
   passing. */

/* Short-circuits the MIGRATION's own §2 so that ONLY this file's assertions can
   see the planted defect. §2 is the strongest catch there is — it refuses to
   install broken — but it only runs at APPLY time, and the regression this must
   still catch in a year is a LATER migration restating hr_claim_bounty__ungated
   from a stale template (the b484–b487 gate-bucket class). `return` exits the
   do-block, leaving §1's patch installed and every check after it unrun. */
const GATE_BLIND = [
  '  -- (a) STATIC: the three edits are actually in the installed body.',
  '  if true then return; end if;   -- selftest: §2 short-circuited\n'
  + '  -- (a) STATIC: the three edits are actually in the installed body.',
];

const MUTATIONS = {
  no_credit: {
    why: 'THE BUG ITSELF, restored: the skills upsert is deleted, so a turn-in pays gold and Marks '
       + 'and the Bounty-Hunter skill stays at 0 forever — the board never opens past tier 1 for '
       + 'anybody',
    find: "    || '  if coalesce(v_ab.xp_reward, 0) > 0 then' || chr(10)\n"
        + "    || '    insert into public.player_skills as sk (user_id, slot, skill_id, xp)' || chr(10)\n"
        + "    || '      values (auth.uid(), v_slot, ''bountyHunter'', greatest(0, v_ab.xp_reward)::bigint)' || chr(10)\n"
        + "    || '      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;' || chr(10)\n"
        + "    || '  end if;';",
    repl: "    || '  -- no credit';",
  },
  bare_update: {
    why: 'the UPSERT is replaced by a bare UPDATE — the `unknown_skill` shape. A character created '
       + 'before bountyHunter entered the catalogue has no row, so the credit silently writes '
       + 'nothing and the player is told they were paid',
    find: "    || '    insert into public.player_skills as sk (user_id, slot, skill_id, xp)' || chr(10)\n"
        + "    || '      values (auth.uid(), v_slot, ''bountyHunter'', greatest(0, v_ab.xp_reward)::bigint)' || chr(10)\n"
        + "    || '      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;' || chr(10)",
    repl: "    || '    update public.player_skills set xp = xp + greatest(0, v_ab.xp_reward)::bigint' || chr(10)\n"
        + "    || '      where user_id = auth.uid() and slot = v_slot and skill_id = ''bountyHunter'';' || chr(10)",
  },
  conflict_do_nothing: {
    why: 'the upsert becomes ON CONFLICT DO NOTHING, so the FIRST bounty of a character\'s life '
       + 'pays and every one after it silently pays nothing — the slowest possible version of the '
       + 'same bug, and the one a single-turn-in test would miss',
    find: "    || '      on conflict (user_id, slot, skill_id) do update set xp = sk.xp + excluded.xp;' || chr(10)",
    repl: "    || '      on conflict (user_id, slot, skill_id) do nothing;' || chr(10)",
  },
  xp_scales_with_required: {
    why: 'THE FORGERY: the credit is scaled by `required`, which is a CLIENT-PROPOSED number the '
       + 'server merely clamps into a band. A clamped value used as a MULTIPLIER is still a client '
       + 'value deciding a payout — and this one lands on a RANKED skill (hr_lb_skills carries a '
       + 'bountyHunter board, and hr_total_level sums every row)',
    find: "    || '      values (auth.uid(), v_slot, ''bountyHunter'', greatest(0, v_ab.xp_reward)::bigint)' || chr(10)",
    repl: "    || '      values (auth.uid(), v_slot, ''bountyHunter'', greatest(0, v_ab.xp_reward + v_ab.required)::bigint)' || chr(10)",
  },
  no_journal: {
    why: 'the ledger row stops naming the skill and the amount, so the one value transfer this '
       + 'call makes into a RANKED column is not reconstructible from the journal — which is also '
       + 'the only way to unwind it by hand if the credit ever has to be reversed',
    find: "    || '    (user_id, slot, kind, intent, gold, skill_id, xp, gold_in, xp_in, qty_in, gems_in, meta)' || chr(10)\n"
        + "    || '  values' || chr(10)\n"
        + "    || '    (auth.uid(), v_slot, ''bounty'', ''bounty_turnin:'' || v_ab.bounty_id,' || chr(10)\n"
        + "    || '     v_ab.gold_reward, ''bountyHunter'', greatest(0, coalesce(v_ab.xp_reward, 0))::bigint,' || chr(10)\n"
        + "    || '     0, 0, 0, 0,';",
    repl: "    || '    (user_id, slot, kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta)' || chr(10)\n"
        + "    || '  values' || chr(10)\n"
        + "    || '    (auth.uid(), v_slot, ''bounty'', ''bounty_turnin:'' || v_ab.bounty_id,' || chr(10)\n"
        + "    || '     v_ab.gold_reward, 0, 0, 0, 0,';",
  },
  xp_in_counted: {
    why: 'xp_in stops being 0, so a once-per-accept catalogued reward starts consuming the SHARED '
       + 'daily inflow budget that the accrual engine needs — an honest night of gathering begins '
       + 'refusing because the player also handed in a bounty. The reviewed posture is explicit: '
       + 'the once-guard is the limiter, not the budget',
    find: "    || '     v_ab.gold_reward, ''bountyHunter'', greatest(0, coalesce(v_ab.xp_reward, 0))::bigint,' || chr(10)\n"
        + "    || '     0, 0, 0, 0,';",
    repl: "    || '     v_ab.gold_reward, ''bountyHunter'', greatest(0, coalesce(v_ab.xp_reward, 0))::bigint,' || chr(10)\n"
        + "    || '     0, greatest(0, coalesce(v_ab.xp_reward, 0))::bigint, 0, 0,';",
  },
  no_receipt_key: {
    why: 'the receipt stops naming the credited skill. The client branches on `xp_skill` to decide '
       + 'whether to predict the xp for display; without it either the client predicts against a '
       + 'server that credits nothing (a phantom level that snaps back at the next envelope — the '
       + 'b491 defect) or it never predicts at all and the level only moves at the settle',
    find: "    || '    ''slot'', v_slot, ''credited'', true, ''xp_skill'', ''bountyHunter'');';",
    repl: "    || '    ''slot'', v_slot, ''credited'', true);';",
  },
  patch_skipped: {
    why: 'the whole splice is skipped, i.e. the migration applies GREEN and does nothing — exactly '
       + 'what a stale-template restatement of hr_claim_bounty__ungated by a LATER migration would '
       + 'leave behind. The suite must never read that as shipped',
    find: '  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), \'\');\n\n'
        + "  if position('''bountyHunter''' in v_src) > 0 then",
    repl: '  v_src := replace(pg_get_functiondef(c_sig::regprocedure), chr(13), \'\');\n\n'
        + '  if true then',
  },
};

/* EVERY body defect above, repeated with the migration's own §2 short-circuited
   so ONLY this guard's assertions can see it. Without these twins the selftest
   would only be proving that the MIGRATION refuses to install broken — which is
   true, and which stops mattering the day a later migration restates this body
   from a stale template and never runs §2 at all. That is the b484–b487
   gate-bucket class, and it is the regression this file has to still catch in a
   year. `patch_skipped` is deliberately NOT twinned: it IS the no-gate case. */
for (const id of ['no_credit', 'bare_update', 'conflict_do_nothing', 'xp_scales_with_required',
  'no_journal', 'xp_in_counted', 'no_receipt_key']) {
  MUTATIONS[id + '_gate_blind'] = {
    why: MUTATIONS[id].why + " — with the migration's own §2 short-circuited, so ONLY this guard can see it",
    find: MUTATIONS[id].find,
    repl: MUTATIONS[id].repl,
    also: [GATE_BLIND],
  };
}

const N = (v) => Number(v ?? 0);

/** One end-to-end run against a freshly replayed database. */
async function run(mutate) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  let patchList;
  if (mutate) {
    const m = MUTATIONS[mutate];
    patchList = new Map([[m.file || MIG, [[m.find, m.repl], ...(m.also || [])]]]);
  }
  const { db } = await bootReplay({ patches: patchList, upTo: MIG });

  const q = async (sql, p) => (await db.query(sql, p)).rows;
  /* SESSION-SCOPED (`is_local = false`): PGlite runs each query in its own
     implicit transaction, so a transaction-local GUC would be gone by the next
     statement and auth.uid() would read NULL. */
  const setSub = (uid) => q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  const asUser = async (uid, sql, p) => {
    await setSub(uid);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  // ── FIXTURE: one real player, created the server's own way ────────────
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q('insert into auth.users (id, instance_id, aud, role, email) '
    + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
  [uid, 'bhx@probe.invalid']);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await gate();
  await asUser(uid, 'select public.claim_display_name($1) as r', ['BhxProbe']);
  await gate();
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  ok(cr?.ok === true, `FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`);

  // Maxed combat skills so the SERVER combat-level tier gate is never the thing
  // under test except where it is named.
  await q(`insert into public.player_skills (user_id, slot, skill_id, xp)
           select $1, 0, s, 13034431 from unnest(array['attack','strength','defense',
             'hitpoints','prayer','ranged','magic']) s
           on conflict (user_id, slot, skill_id) do update set xp = 13034431`, [uid]);

  const bhXp = async () => N((await q(
    "select xp::text v from player_skills where user_id=$1 and slot=0 and skill_id='bountyHunter'",
    [uid]))[0]?.v);
  const bhRowExists = async () => (await q(
    "select 1 from player_skills where user_id=$1 and slot=0 and skill_id='bountyHunter'", [uid])).length > 0;
  const skillMap = async () => Object.fromEntries((await q(
    'select skill_id, xp::text xp from player_skills where user_id=$1 and slot=0', [uid]))
    .map((r) => [r.skill_id, N(r.xp)]));
  const skillDelta = (before, after) => {
    const out = {};
    for (const k of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const d = N(after[k]) - N(before[k]);
      if (d !== 0) out[k] = d;
    }
    return out;
  };
  const balances = async () => {
    const r = (await q('select gold::text g, marks::text m from player_state where user_id=$1 and slot=0', [uid]))[0];
    return { gold: N(r.g), marks: N(r.m) };
  };
  const catalogueXp = async (tier, diff) => N((await q(
    "select xp::text v from public.hr_bounty_reward($1,'cull',$2)", [tier, diff]))[0]?.v);
  const levelOf = async (xp) => N((await q(
    'select public.hr_level_from_xp($1::bigint) as v', [xp]))[0]?.v);

  /* THE REAL CLIENT PATH: the rate-gated wrappers, as `authenticated`. */
  const accept = async (target, diff, required, id) => {
    await gate();
    return asUser(uid, 'select public.hr_accept_bounty(0,$1,$2,$3,$4,$5) as r',
      [id || 'b_' + Math.random().toString(36).slice(2), target, 'cull', diff, required]);
  };
  const claim = async () => {
    await gate();
    return asUser(uid, 'select public.hr_claim_bounty(0) as r');
  };
  /* Record exactly `required` NEW kills of the target against the SERVER's own
     bestiary counter, which is what hr_claim_bounty verifies. Written directly
     (as the owner) rather than through hr_credit_kills: the physics cap is that
     verb's contract and is proven by tests/kill-daily-credit.mjs — mixing it in
     here would make a cap-throttle look like a missing XP credit. */
  const fill = async (target) => {
    const ab = (await q('select target, required::text req, baseline::text base '
      + 'from active_bounty where user_id=$1 and slot=0', [uid]))[0];
    if (!ab) return null;
    await q(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
             values ($1, 0, 'stat', 'ev:kill_monster:'||$2, $3, '', 'active')
             on conflict (user_id, slot, kind, key, period_key)
               do update set value = excluded.value`,
    [uid, ab.target, N(ab.base) + N(ab.req)]);
    return ab;
  };

  const monAt = async (tier) => (await q(
    'select monster_id from public.hr_bounty_monsters where tier = $1 order by monster_id limit 1', [tier]))[0]?.monster_id;
  const T1 = await monAt(1);
  const T3 = await monAt(3);
  ok(!!T1 && !!T3, 'FIXTURE: the bounty monster catalogue has no tier-1 or tier-3 entry');

  const obs = {};

  // ── BHX-0 · CONTROL: the migration actually patched the body ──────────
  {
    const src = (await q("select replace(pg_get_functiondef("
      + "'public.hr_claim_bounty__ungated(int)'::regprocedure), chr(13),'') as s"))[0].s;
    obs.bhx0_patched = src.includes("'bountyHunter'");
    ok(obs.bhx0_patched,
      'BHX-0: hr_claim_bounty__ungated does not mention bountyHunter — the migration applied '
      + 'GREEN and changed nothing. Everything below would pass or fail for the wrong reason.');
  }

  // ── BHX-1 · THE DEFECT: a turn-in credits the skill, on a character that
  //           has NO bountyHunter row (the pre-catalogue shape) ───────────
  {
    await q("delete from player_skills where user_id=$1 and slot=0 and skill_id='bountyHunter'", [uid]);
    ok(!(await bhRowExists()), 'BHX-1 CONTROL: the fixture failed to remove the bountyHunter row, '
      + 'so the upsert\'s INSERT arm is not under test');

    const want = await catalogueXp(1, 'hard');
    obs.bhx1_want = want;
    ok(want === 59, `BHX-1 CONTROL: tier-1 hard cull xp is ${want}, expected 59 — the reward table `
      + 'moved and this guard\'s arithmetic no longer describes it');

    const before = await skillMap();
    const bal0 = await balances();
    const a = await accept(T1, 'hard', 999999);       // a FORGED required; the clamp handles it
    ok(a?.ok === true, `BHX-1: accept refused: ${JSON.stringify(a)}`);
    await fill(T1);
    const c = await claim();
    ok(c?.ok === true, `BHX-1: the met bounty did not pay: ${JSON.stringify(c)}`);

    obs.bhx1_xp = await bhXp();
    ok(obs.bhx1_xp === want,
      `BHX-1: Bounty-Hunter XP is ${obs.bhx1_xp} after a completed turn-in, expected ${want}. `
      + 'THE P0 IS LIVE: the server credits nothing, applyRecord puts the 0 back on the next '
      + 'envelope, and every board tier above 1 stays unreachable for every player.');

    // CONTAINMENT: the credit moves that skill and nothing else.
    obs.bhx1_delta = skillDelta(before, await skillMap());
    ok(JSON.stringify(obs.bhx1_delta) === JSON.stringify({ bountyHunter: want }),
      `BHX-1: the turn-in moved ${JSON.stringify(obs.bhx1_delta)}, expected only `
      + `{"bountyHunter":${want}} — a bounty turn-in must not touch another skill`);

    // The reward it rode in on is UNCHANGED (tier-1 hard = 420 gold, 8 marks).
    const bal1 = await balances();
    obs.bhx1_gold = bal1.gold - bal0.gold;
    obs.bhx1_marks = bal1.marks - bal0.marks;
    ok(obs.bhx1_gold === 420 && obs.bhx1_marks === 8,
      `BHX-1: the gold/Marks credit moved to ${obs.bhx1_gold}/${obs.bhx1_marks} (expected 420/8) — `
      + 'the XP patch changed the reward it was supposed to ride alongside');

    // ── BHX-6 · the receipt names the credited skill ────────────────────
    obs.bhx6 = c?.xp_skill;
    ok(obs.bhx6 === 'bountyHunter',
      `BHX-6: the claim receipt carries xp_skill=${JSON.stringify(obs.bhx6)}, expected `
      + '"bountyHunter". That key is what lets the CLIENT tell a crediting server from a '
      + 'pre-migration one; without it the client either predicts a phantom level that snaps '
      + 'back at the next envelope, or never predicts at all.');

    // ── BHX-3 · IDEMPOTENT ON REPLAY ────────────────────────────────────
    const c2 = await claim();
    obs.bhx3_err = c2?.error;
    obs.bhx3_xp = await bhXp();
    ok(c2?.ok !== true && c2?.error === 'no_active_bounty',
      `BHX-3: a replayed claim answered ${JSON.stringify(c2)}, expected no_active_bounty`);
    ok(obs.bhx3_xp === obs.bhx1_xp,
      `BHX-3: a REPLAY re-credited Bounty-Hunter XP (${obs.bhx1_xp} -> ${obs.bhx3_xp}). The credit `
      + 'must sit inside the active_bounty once-guard, never beside it.');

    // ── BHX-4 · ONE journal row, and it describes the transfer ──────────
    const led = await q("select skill_id, xp::text xp, xp_in::text xin, gold::text g, intent "
      + "from player_ledger where user_id=$1 and kind='bounty'", [uid]);
    obs.bhx4_rows = led.length;
    ok(led.length === 1,
      `BHX-4: ${led.length} bounty ledger rows for one turn-in, expected exactly 1 — value `
      + 'transfers are journalled once, never per tick (game_events reached 1.6M rows / 229 MB '
      + 'from 6 players in 4 days by ignoring that)');
    obs.bhx4 = led[0] ? { skill: led[0].skill_id, xp: N(led[0].xp), xp_in: N(led[0].xin) } : null;
    ok(obs.bhx4 && obs.bhx4.skill === 'bountyHunter' && obs.bhx4.xp === want,
      `BHX-4: the journal does not describe the credit (${JSON.stringify(obs.bhx4)}) — the one `
      + 'value transfer this call makes into a RANKED column is not reconstructible, and there is '
      + 'no way to unwind it by hand');
    ok(obs.bhx4 && obs.bhx4.xp_in === 0,
      `BHX-4: xp_in is ${obs.bhx4 && obs.bhx4.xp_in}, expected 0. A once-per-accept, `
      + 'server-catalogued reward is deliberately OUTSIDE the shared daily inflow budget (the '
      + 'muster/raid-chest rule); counting it there makes an honest night start refusing.');
  }

  // ── BHX-5 · the UPSERT's UPDATE arm: a SECOND turn-in adds ────────────
  {
    const want = await catalogueXp(1, 'normal');
    const before = await bhXp();
    const a = await accept(T1, 'normal', 999999);
    ok(a?.ok === true, `BHX-5: accept refused: ${JSON.stringify(a)}`);
    await fill(T1);
    const c = await claim();
    ok(c?.ok === true, `BHX-5: the second turn-in did not pay: ${JSON.stringify(c)}`);
    obs.bhx5 = (await bhXp()) - before;
    ok(obs.bhx5 === want,
      `BHX-5: the SECOND turn-in added ${obs.bhx5} xp, expected ${want}. The first bounty of a `
      + 'character\'s life paying and every one after it paying nothing is the same P0 in slow '
      + 'motion — an ON CONFLICT DO NOTHING instead of an accumulate.');
  }

  // ── BHX-2 · THE AMOUNT IS THE SERVER'S. A forged client value cannot
  //           move it, at any difficulty or any proposed count ───────────
  {
    const seen = {};
    for (const diff of ['easy', 'normal', 'hard']) {
      const want = await catalogueXp(1, diff);
      const row = [];
      for (const forged of [1, 999999]) {     // below the floor and above the ceiling
        const before = await bhXp();
        const a = await accept(T1, diff, forged);
        ok(a?.ok === true, `BHX-2: accept(${diff}, required=${forged}) refused: ${JSON.stringify(a)}`);
        await fill(T1);
        const c = await claim();
        ok(c?.ok === true, `BHX-2: claim(${diff}, required=${forged}) refused: ${JSON.stringify(c)}`);
        row.push((await bhXp()) - before);
      }
      seen[diff] = { want, got: row };
      ok(row[0] === want && row[1] === want,
        `BHX-2: ${diff} cull credited ${JSON.stringify(row)} for a forged required of [1, 999999], `
        + `expected [${want}, ${want}]. The XP must be derived from the bounty the SERVER wrote at `
        + 'accept time — a clamped client number used as an input is still a client number '
        + 'deciding a payout, and this one lands on a RANKED skill.');
    }
    obs.bhx2 = seen;
  }

  // ── BHX-7 · THE ENVELOPE ROUND TRIP — the level does not reset ────────
  // The assertion the original defect could never have passed. Take the REAL
  // hr_state_of envelope this database produces and run it through the REAL
  // client record apply + display accessor.
  {
    const env = (await q('select public.hr_state_of($1::uuid, 0) as r', [uid]))[0].r;
    obs.bhx7_serverXp = N(env?.skills?.bountyHunter?.xp);
    ok(obs.bhx7_serverXp === (await bhXp()),
      `BHX-7: hr_state_of reports bountyHunter xp ${obs.bhx7_serverXp} but the table holds `
      + `${await bhXp()} — the projection and the truth disagree`);

    const v = (await readFile(new URL('../src/net/record.js', import.meta.url), 'utf8'))
      .match(/accrue\.js\?v=(\d+)/);
    const q$ = v ? `?v=${v[1]}` : '';
    const R = await import(SRC('net/record.js' + q$));
    const S = await import(SRC('net/skill-record.js' + q$));
    const A = await import(SRC('net/accrue.js' + q$));
    const X = await import(SRC('core/xp.js' + q$));
    A.setServerAccrualEnabled(true);
    ok(R.isServerOfRecord('skills'),
      'BHX-7 CONTROL: `skills` is not server-of-record in this build, so the round trip under '
      + 'test is not the one production runs');

    /* A client that had "earned" the xp locally, exactly as the old code left
       it. The envelope must OVERWRITE it with the server's number — that
       downward direction IS the anti-forgery property — and the resulting level
       must be the server's, not 1. */
    const G = { skills: { bountyHunter: 999999 } };
    R.applyRecord(G, { ok: true, version: 9, now: Date.now(), state: env.state, skills: env.skills });
    obs.bhx7_afterMap = N(G.skills?.bountyHunter);
    obs.bhx7_level = S.skillLevelForDisplay(G, 'bountyHunter', X.levelFromXp);
    const wantLevel = await levelOf(obs.bhx7_serverXp);
    ok(obs.bhx7_afterMap === obs.bhx7_serverXp,
      `BHX-7: after the envelope G.skills.bountyHunter is ${obs.bhx7_afterMap}, expected the `
      + `server's ${obs.bhx7_serverXp} — a forged local xp survived an authoritative read`);
    ok(obs.bhx7_level === wantLevel && wantLevel > 1,
      `BHX-7: the level after the envelope round trip is ${obs.bhx7_level}, expected `
      + `${wantLevel} (from ${obs.bhx7_serverXp} server xp). THIS IS THE ORIGINAL DEFECT: the `
      + 'client earned it, the envelope replaced G.skills wholesale from a server map that had '
      + 'never been credited, and the level read 1 again.');
    R.forgetServerOfRecord?.(G);
    A.setServerAccrualEnabled(false);
  }

  // ── BHX-8 · THE GATE ACTUALLY OPENS. Grind REAL turn-ins until the
  //           SERVER's own level curve reaches 20, then ask the REAL client
  //           ladder what the board unlocks ─────────────────────────────
  {
    const B = await import(SRC('core/bounty.js'));
    ok(typeof B.boardTierForBountyLevel === 'function',
      'BHX-8: src/core/bounty.js does not export boardTierForBountyLevel — the board-tier ladder '
      + 'is back inside the monolith where nothing outside a browser can assert on it');

    const per = await catalogueXp(3, 'hard');
    ok(per === 234, `BHX-8 CONTROL: tier-3 hard cull xp is ${per}, expected 234`);

    let lastLevel = await levelOf(await bhXp());
    let tierBefore = B.boardTierForBountyLevel(lastLevel);
    let turnins = 0;
    while (lastLevel < 20 && turnins < 40) {
      const a = await accept(T3, 'hard', 999999);
      if (a?.ok !== true) { ok(false, `BHX-8: accept refused mid-grind: ${JSON.stringify(a)}`); break; }
      await fill(T3);
      const c = await claim();
      if (c?.ok !== true) { ok(false, `BHX-8: claim refused mid-grind: ${JSON.stringify(c)}`); break; }
      turnins++;
      tierBefore = B.boardTierForBountyLevel(lastLevel);
      lastLevel = await levelOf(await bhXp());
    }
    obs.bhx8 = { turnins, xp: await bhXp(), level: lastLevel, tierBefore,
      tier: B.boardTierForBountyLevel(lastLevel) };
    ok(lastLevel >= 20,
      `BHX-8: ${turnins} completed tier-3 hard bounties left the character at Bounty-Hunter `
      + `${lastLevel} with ${obs.bhx8.xp} xp — the server is not crediting enough to ever reach `
      + 'the Lv20 rung, so tier 2 of the board stays unreachable');
    ok(obs.bhx8.tier === 2,
      `BHX-8: at Bounty-Hunter ${lastLevel} the board unlocks tier ${obs.bhx8.tier}, expected 2. `
      + 'This is the whole point of the fix: the credit has to move the LADDER, not just a number.');
    ok(tierBefore === 1,
      `BHX-8: the turn-in BEFORE the one that crossed Lv20 already reported tier ${tierBefore} — `
      + 'the ladder is not discriminating, so "tier 2 unlocked" proves nothing');
    // And the rung is where the server's curve says it is.
    ok((await levelOf(4470)) === 20 && (await levelOf(4469)) === 19,
      'BHX-8: the SERVER xp curve no longer puts level 20 at 4,470 xp, so the client ladder and '
      + 'the credit are climbing different stairs');
  }

  // ── BHX-9 · the ladder is a value pin, mutation-proved out of band ────
  {
    const src = await readFile(new URL('../src/core/bounty.js', import.meta.url), 'utf8');
    const B = await import(SRC('core/bounty.js'));
    const table = [[1, 1], [19, 1], [20, 2], [29, 2], [30, 3], [39, 3], [40, 4], [49, 4],
      [50, 5], [59, 5], [60, 6], [99, 6]];
    const bad = table.filter(([lv, t]) => B.boardTierForBountyLevel(lv) !== t);
    obs.bhx9_bad = bad;
    ok(!bad.length, 'BHX-9: the board-tier ladder drifted at ' + JSON.stringify(bad));
    ok(B.boardTierForBountyLevel(null) === 1 && B.boardTierForBountyLevel(undefined) === 1
       && B.boardTierForBountyLevel(NaN) === 1,
    'BHX-9: a missing/garbage Bounty-Hunter level must fail CLOSED to tier 1 — never hand a '
      + 'level-1 player a tier-6 contract because a read failed');
    /* THE MUTATION PROOF for this pin: the ladder is a plain table in a module
       with no imports, so a mutated copy can be imported from a data URL and the
       pin re-run against it. If that does NOT go red, the pin is decoration. */
    const mutated = src.replace('Object.freeze([20, 2])', 'Object.freeze([25, 2])');
    ok(mutated !== src, 'BHX-9 SELFTEST: the ladder anchor did not match — the pin cannot be '
      + 'mutation-proved, which means it is not proven at all');
    const M = await import('data:text/javascript,' + encodeURIComponent(mutated));
    ok(M.boardTierForBountyLevel(20) !== 2,
      'BHX-9 SELFTEST: a ladder with the tier-2 rung moved to Lv25 still answered 2 at Lv20 — '
      + 'the pin above cannot see a ladder change');
  }

  // ── BHX-10 · no client write surface on the column this now credits ───
  {
    const g = await q(`select privilege_type from information_schema.role_table_grants
                        where table_schema='public' and table_name='player_skills'
                          and grantee in ('anon','authenticated','service_role','PUBLIC')
                          and privilege_type <> 'SELECT'`);
    const p = await q(`select cmd from pg_policies
                        where schemaname='public' and tablename='player_skills' and cmd <> 'SELECT'`);
    obs.bhx10 = { grants: g.length, policies: p.length };
    ok(g.length === 0 && p.length === 0,
      `BHX-10: player_skills carries ${g.length} client write grant(s) and ${p.length} non-SELECT `
      + 'policy(ies) — the RANKED xp this file now credits would be directly forgeable, which '
      + 'would make every assertion above beside the point');
  }

  await db.close?.();
  return { problems, obs };
}

// ── RUNNER ─────────────────────────────────────────────────────────────
export async function bountyHunterXpGuard() {
  const { problems } = await run(null);
  return problems.map((p) => 'bounty-hunter-xp: ' + p);
}

/* Same main-detection as tests/kill-daily-credit.mjs — an exact path compare, so
   importing this module for its exported guard never trips the CLI. */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv.slice(2);
  const listOnly = arg.includes('--list');
  const selftest = arg.includes('--selftest');
  const one = (arg.find((a) => a.startsWith('--mutate=')) || '').split('=')[1];

  if (listOnly) {
    for (const [id, m] of Object.entries(MUTATIONS)) console.log(`${id}\n    ${m.why}\n`);
    process.exit(0);
  }

  if (selftest) {
    let bad = 0;
    for (const id of Object.keys(MUTATIONS)) {
      let caught = null;
      try {
        const { problems } = await run(id);
        caught = problems.length ? problems : null;
      } catch (e) {
        if (e && e.harness) { console.log(`✖ ${id}: HARNESS — ${e.message}`); bad++; continue; }
        caught = ['migration/harness rejected it: ' + String(e.message).split('\n')[0].slice(0, 200)];
      }
      if (caught) console.log(`✔ ${id} CAUGHT — ${caught[0].slice(0, 180)}`);
      else { console.log(`✖ ${id} NOT CAUGHT — the guard cannot see this defect`); bad++; }
    }
    console.log(bad ? `\n${bad} mutation(s) not caught` : '\nevery mutation caught');
    process.exit(bad ? 1 : 0);
  }

  const t0 = Date.now();
  /* CAUGHT, because an unhandled PGlite rejection dumps the whole minified WASM
     driver over the failure and the actual message scrolls away. */
  let problems; let obs;
  try { ({ problems, obs } = await run(one || null)); }
  catch (e) {
    console.log('bounty-hunter-xp: the run THREW — ' + String(e && e.message).split('\n')[0]);
    if (e && e.query) console.log('  query: ' + String(e.query).slice(0, 300));
    process.exit(1);
  }
  console.log(JSON.stringify(obs, null, 1));
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log(' ✖ ' + p);
    process.exit(1);
  }
  console.log(`\nbounty-hunter-xp: green in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
