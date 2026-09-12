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
import { bootReplay, chainFiles } from './schema-replay.mjs';

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
               'credit moves nothing, the high-water never falls, every raise is journalled ONCE '
               '(C2) and a raising hr_renown_of cannot refuse a paid settle (C1), nothing became '
               'client-executable — all green';
end $$;`,
  `  null;
exception when others then
  raise notice 'Sec 3 SHORT-CIRCUITED FOR THE MUTATION PROOF: %', sqlerrm;
end $$;`,
];

/* Anchors quoted from the migration, one per moving part of the ratchet:
   SOURCE  (where the figure comes from),
   WHERE   (the raise-only predicate that makes `found` mean "it moved"),
   JOURNAL (C2's one-row-per-raise),
   GUARDED (C1's exception wrapper). */
const SOURCE = `          from (select coalesce(public.hr_renown_of(v_uid, v_slot), 0) as v) r`;
const WHERE = `           and coalesce(ps.renown_high, 0) < r.v`;
const JOURNAL = `        if found then
          insert into public.player_ledger (user_id, slot, kind, intent, meta)
          values (v_uid, v_slot, 'renown', 'renown_ratchet',
                  jsonb_build_object('to', v_rh, 'intent_id', p_intent_id));
        end if;`;
const GUARDED = `    exception when others then
      raise warning 'renown ratchet skipped for %/%: %', v_uid, v_slot, sqlerrm;
    end;`;

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
  ratchet_never_fires: {
    by: 'R1',
    why: 'the raise-only predicate is made unsatisfiable, so the cached column only ever moves when '
       + 'a player clicks Claim — the projection is honest and permanently stale, which is the '
       + 'original bug with an extra key on the envelope',
    find: WHERE,
    repl: '           and false',
  },
  ratchet_reads_client_counter: {
    by: 'R1',
    why: 'the high-water is sourced from the raw lifetime kill counter instead of hr_renown_of — a '
       + 'number hr_credit_kills writes on a CLIENT claim. The cached figure stops being the score '
       + 'the claim path decides on, and client-credited kills start buying rank',
    find: SOURCE,
    repl: `          from (select coalesce((select value from public.player_progress
                                   where user_id = v_uid and slot = v_slot
                                     and kind = 'stat' and period_key = ''
                                     and key = 'ev:kill_any'), 0) as v) r`,
  },
  ratchet_banks_credited_kills: {
    by: 'R4',
    why: 'the ratchet adds the client-credited kill count back on top of the discounted score. The '
       + 'first settle still matches (nothing credited yet), so only the credit test sees it — and '
       + 'because the column is a HIGH-WATER with no lowering path, a forged credit banked once is '
       + 'banked forever',
    find: SOURCE,
    repl: `          from (select coalesce(public.hr_renown_of(v_uid, v_slot), 0)
                     + coalesce((select value from public.player_progress
                                  where user_id = v_uid and slot = v_slot
                                    and kind = 'stat' and period_key = ''
                                    and key = 'ev:kill_credited_any'), 0) as v) r`,
  },
  ratchet_not_monotonic: {
    by: 'R5',
    why: 'the raise-only `<` becomes `<>`, so the cached figure follows the LIVE score DOWN. '
       + 'Spending gold or breaking a streak would then demote a rank the player earned — the exact '
       + 'failure 2026-08-22-renown-claim.sql added the high-water to prevent',
    find: WHERE,
    repl: '           and coalesce(ps.renown_high, 0) <> r.v',
  },
  journal_on_every_apply: {
    by: 'R6',
    why: 'C2 REGRESSED INTO A PER-TICK LOG: `<` becomes `<=`, so a settle that raised NOTHING still '
       + 'matches, `found` is true and a ledger row is written on every apply. The value stays '
       + 'monotonic and every other check passes — this is the game_events mistake (1.6M rows from '
       + 'six players in four days) reproduced at ledger scale',
    find: WHERE,
    repl: '           and coalesce(ps.renown_high, 0) <= r.v',
  },
  raise_not_journalled: {
    by: 'R6',
    why: 'C2 REMOVED: a raise of the rank authority is written with no audit row, so an inflation is '
       + 'undetectable and — because nothing anywhere lowers renown_high — irreversible, while '
       + 'hr_claim_rank pays up to 1,000,000 gold + 500 gems against it. The literal stays in a '
       + 'comment ON PURPOSE, so every text scan (the migration\'s own gate included) still passes '
       + 'and only the behavioural check can see it',
    find: JOURNAL,
    repl: `        if found then
          -- 'renown_ratchet' — journal removed for the mutation proof
          null;
        end if;`,
  },
  ratchet_unprotected: {
    by: 'R7',
    why: 'C1 REMOVED: the ratchet loses its own subtransaction, so ANY raise inside hr_renown_of '
       + '(it casts `streak_days` off a by-name whole-row read of a column Slice 3 owns) lands in '
       + "hr_apply's bad_delta handler and rolls back the WHOLE delta — a display high-water eating "
       + "a paid settle",
    find: GUARDED,
    repl: '    end;',
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

/* ── BLINDING THE CHAIN, NOT ONE FILE ──────────────────────────────────────
   §3 is not the only gate a planted defect can trip. 2026-09-12-dungeon-cooldown
   .sql SPLICES hr_state_of and therefore asserts, at ITS apply time, that the
   renown key is still projected (its §7(c)) — so `projection_key_renamed` made
   the CHAIN throw before this guard ever ran, and the arm demonstrated a
   migration's gate for the second time instead of this file's assertions. That
   is not a one-off: every future migration that composes with hr_state_of is
   expected to assert the same way, so blinding by FILE NAME would break again on
   the next one.

   So gate-blind mode is generic and derived from the mutation itself:

     · the MARKERS are the SQL string literals the mutation makes DISAPPEAR
       (present in `find`, absent from `repl`) — for projection_key_renamed that
       is exactly `renown_high`. A mutation that removes no literal (every
       predicate/body mutation here) blinds nothing and is unaffected.
     · every file LATER in tests/schema-apply-order.json is scanned for
       `if … then` gate headers mentioning a marker, and each such condition is
       replaced by `false`. The gate stops firing; the migration on disk and
       every non-blind arm are untouched, and the file's OTHER gates still bite.

   Over-blinding is the safe direction: it only removes migration gates, and the
   arm still has to go red on THIS guard's own assertions or the selftest reports
   STAYED GREEN. Under-blinding is what produced the red we are fixing. */
function blindMarkers(m) {
  if (m.blinds) return m.blinds;                       // explicit override, rarely needed
  const lits = (s) => new Set((s.match(/'[A-Za-z_][A-Za-z0-9_]{3,}'/g) || []).map((x) => x.slice(1, -1)));
  const kept = lits(m.repl);
  return [...lits(m.find)].filter((t) => !kept.has(t));
}

/* A gate header: an `if`/`elsif` whose condition ends at a line ending in `then`.
   Conditions in this repo span up to four lines, hence the non-greedy [\s\S]. */
const GATE_HEADER = /^([ \t]*)(if|elsif)\b([\s\S]*?)\bthen[ \t]*$/gm;

async function laterChainBlinds(mutate) {
  const markers = blindMarkers(MUTATIONS[mutate]);
  if (!markers.length) return [];
  const files = await chainFiles();
  const at = files.findIndex(([n]) => n === MIG);
  if (at < 0) { const e = new Error(`${MIG} is not in the apply chain`); e.harness = true; throw e; }
  const out = [];
  for (const [name, path] of files.slice(at + 1)) {
    const sql = (await readFile(path, 'utf8')).replace(/\r\n/g, '\n');
    const pairs = [];
    for (const mt of sql.matchAll(GATE_HEADER)) {
      const header = mt[0];
      if (!markers.some((k) => header.includes(k))) continue;
      const blinded = `${mt[1]}${mt[2]} false /* gate-blind: ${markers.join(', ')} */ then`;
      /* bootReplay demands an anchor that matches EXACTLY once, so grow it line
         by line until it is unique rather than silently patching the wrong gate. */
      let anchor = header;
      let end = mt.index + header.length;
      while (sql.split(anchor).length - 1 > 1 && end < sql.length) {
        const nl = sql.indexOf('\n', end + 1);
        end = nl === -1 ? sql.length : nl;
        anchor = sql.slice(mt.index, end);
      }
      if (sql.split(anchor).length - 1 !== 1) {
        const e = new Error(`gate-blind could not make a unique anchor in ${name} for: ${header.slice(0, 80)}`);
        e.harness = true; throw e;
      }
      pairs.push([anchor, anchor.replace(header, () => blinded)]);
    }
    if (pairs.length) out.push([name, pairs]);
  }
  return out;
}

async function boot(mutate, gateBlind, extra) {
  const pairs = [];
  if (mutate) pairs.push([MUTATIONS[mutate].find, MUTATIONS[mutate].repl]);
  if (extra) pairs.push([extra.find, extra.repl]);
  if (gateBlind) pairs.push(GATE_BLIND);
  if (!pairs.length) { const { db } = await bootReplay(); return db; }
  const patches = new Map([[MIG, pairs]]);
  if (gateBlind && mutate) for (const [name, list] of await laterChainBlinds(mutate)) patches.set(name, list);
  const { db } = await bootReplay({ patches });
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
  /* C2's audit trail: ONE row per real raise, and none for an apply that raised
     nothing. Filtered on `intent` because hr_claim_rank also writes kind='renown'
     (intent='rank_claim:<id>') and counting both would hide a missing row. */
  const ratchetRows = async () => (await db.query(
    `select meta, at, id from public.player_ledger
      where user_id = $1 and slot = 0 and kind = 'renown' and intent = 'renown_ratchet'
      order by at, id`, [UID])).rows;

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
  {
    // C2 — the raise is journalled, exactly once, with the figure and the intent.
    const rows = await ratchetRows();
    ok(rows.length === 1, `the first real raise wrote exactly ONE ledger row (got ${rows.length})`);
    ok(rows[0] && Number(rows[0].meta.to) === proj1,
       `the journalled figure is the banked one (${rows[0] && rows[0].meta.to} vs ${proj1})`);
    ok(rows[0] && typeof rows[0].meta.intent_id === 'string' && rows[0].meta.intent_id.length > 0,
       'the ratchet row records the intent that caused it, so a raise ties back to a settle');
  }

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
  /* The claim PAYS gold, and gold is the goldLog term — so put it back where R1
     measured it. Without this the next apply could raise the high-water by one
     for an honest reason and R4 could not tell that from a banked credit. */
  await db.exec(`update public.player_state set gold = 2000 where user_id = '${UID}' and slot = 0;`);

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
  ok((await ratchetRows()).length === 1,
     `an apply that raised NOTHING wrote no ledger row (got ${(await ratchetRows()).length} in total)`);

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

  // ── R6. ONE LEDGER ROW PER REAL RAISE — AND ONLY PER RAISE ──────────────
  // Three applies have run and exactly one moved the high-water, so there must
  // be exactly one row. Now force a SECOND honest raise (server-written skill xp,
  // the way a settle credits it) and require a second row carrying the new
  // figure. Both halves matter: no row is an unauditable inflation of the rank
  // authority, a row per apply is game_events at ledger scale.
  {
    ok((await ratchetRows()).length === 1,
       `after three applies that raised once, the journal holds one row (got ${(await ratchetRows()).length})`);
    // Ten more SERVER-SIMULATED boss kills, written the way a settle writes them
    // (straight onto the lifetime rows, no credited counter touched). The combat
    // block is already 99, so more xp would move nothing — kills are the term
    // that can still rise here.
    await db.exec(`insert into public.player_progress (user_id, slot, kind, key, value, period_key, state)
                   values ('${UID}', 0, 'stat', 'ev:kill_monster:${boss}', 10, '', 'active'),
                          ('${UID}', 0, 'stat', 'ev:kill_any', 10, '', 'active')
                   on conflict (user_id, slot, kind, key, period_key)
                     do update set value = public.player_progress.value + excluded.value;`);
    const liveUp = await score();
    ok(liveUp > proj1, `the fixture is NON-VACUOUS: ten more boss kills lifted the live score to `
       + `${liveUp}, above the banked ${proj1}`);
    const r6 = await apply({});
    ok(r6 && r6.ok === true, `the raising apply succeeded (got ${JSON.stringify(r6 && r6.error)})`);
    ok(Number(r6 && r6.renown_high) === liveUp,
       `the second raise banked the new figure (${r6 && r6.renown_high} vs ${liveUp})`);
    const rows = await ratchetRows();
    ok(rows.length === 2, `a second real raise wrote a SECOND ledger row (got ${rows.length})`);
    ok(rows.length === 2 && Number(rows[1].meta.to) === liveUp,
       `the second row carries the new figure (${rows.length === 2 ? rows[1].meta.to : 'n/a'} vs ${liveUp})`);
  }

  // ── R7. A BROKEN hr_renown_of MUST NOT EAT A PAID SETTLE (C1) ───────────
  // The reviewer's probe, executed. hr_renown_of casts `streak_days` off a
  // by-name whole-row read of a column Slice 3 owns; give it a body that raises
  // the 22P02 that shape produces, then run a PAID settle. Unwrapped, the raise
  // lands in hr_apply's bad_delta handler and rolls the WHOLE delta back — the
  // measured symptom was ok:false with the gold unchanged.
  {
    const orig = (await one(db,
      `select pg_get_functiondef('public.hr_renown_of(uuid,int)'::regprocedure) as d`)).d;
    const gold0 = Number((await one(db,
      `select gold from public.player_state where user_id=$1 and slot=0`, [UID])).gold);
    const rowsBefore = (await ratchetRows()).length;
    await db.exec(`create or replace function public.hr_renown_of(p_user uuid, p_slot int)
                   returns bigint language plpgsql stable security definer
                   set search_path = public, pg_temp as $rb$
                   begin raise exception 'renown probe: invalid input syntax' using errcode = '22P02';
                   end $rb$;`);
    let r7 = null, threw = null;
    try { r7 = await apply({ gold: 7777 }); } catch (e) { threw = e && e.message; }
    const gold1 = Number((await one(db,
      `select gold from public.player_state where user_id=$1 and slot=0`, [UID])).gold);
    const rowsAfter = (await ratchetRows()).length;
    await db.exec(orig);                                   // restore before R8
    ok(threw === null && r7 && r7.ok === true,
       `a raise inside hr_renown_of did NOT refuse the settle (got ${threw || JSON.stringify(r7 && r7.error)})`);
    ok(gold1 === gold0 + 7777,
       `the paid settle still PAID through a broken hr_renown_of (${gold0} -> ${gold1}, expected `
       + `${gold0 + 7777}) — a display high-water must never eat a player's delta`);
    ok(rowsAfter === rowsBefore,
       `a FAILED ratchet journalled nothing (${rowsBefore} -> ${rowsAfter}) — the write and its audit `
       + 'row live or die together');
    ok((await score()) > 0, 'hr_renown_of was restored before the re-apply check');
  }

  // ── R8. THE FILE RE-APPLIES BYTE-IDENTICALLY ────────────────────────────
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
