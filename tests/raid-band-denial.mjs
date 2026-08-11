#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/raid-band-denial.mjs — ONE PLAYER'S GOOD WEEK MUST NOT DELETE
// ANOTHER PLAYER'S CHEST.
//
// The hypothesis, stated so it can be wrong:
//
//   Under the median band rule, a clanmate who does nothing but play HARDER
//   -- honestly, inside the per-day clamp, with no forgery of any kind --
//   can move a teammate who changed NOTHING from a paid share to
//   `below_band`, which pays literally nothing.
//
// ── WHERE IT RUNS ───────────────────────────────────────────────────────
// In process, against a REAL PostgreSQL (PGlite/WASM, PG 18). Production is
// never touched: no network, no credentials, nothing left behind.
//
// The BEFORE body is the real migration file
// supabase/migrations/2026-08-11-raid-claim-authority.sql, read off disk and
// truncated at its own SELF-VERIFYING COMMIT GATE banner (that block asserts
// against pg_policies and role grants which do not exist in a fixture). The
// function text itself is verbatim -- nothing is retyped, so this harness
// cannot drift from what is deployed.
//
// The AFTER body is supabase/migrations/2026-08-12-raid-band-fairness.sql
// applied WHOLE, commit gate included, so a green run here is also a
// rehearsal of the gate that will decide whether the migration commits.
//
// ── WHY THE VICTIM IS IN A CLAN OF TWO ──────────────────────────────────
// Reported rather than hidden: the denial is a SMALL-clan phenomenon. A
// median over ten contributors barely moves when one of them doubles; a
// median over two contributors IS their mean, so every point the stronger
// member deals raises the weaker member's bar by half a point. That is the
// worst case AND the common case -- a clan is at its smallest exactly when
// it is newest and least able to absorb a member being paid nothing.
//
// ── FALSIFIABILITY ──────────────────────────────────────────────────────
// `--selftest` applies five mutations to the real fix SQL as text and demands
// every one is CAUGHT. A mutation that does not change the SQL text is itself
// a harness failure. Run it; a clean run without it proves nothing.
//
//   node tests/raid-band-denial.mjs
//   node tests/raid-band-denial.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
const { PGlite } = createRequire(import.meta.url)('@electric-sql/pglite');

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const MIG = path.join(HERE, '..', 'supabase', 'migrations');
const FIXTURE = readFileSync(path.join(HERE, 'sql', 'raid-exploit-fixture.sql'), 'utf8');

// The shipped body, minus its own commit gate (which asserts against policies
// and roles a fixture does not have). Split on the banner the file itself
// prints, so a rewrite of that file cannot silently smuggle statements in.
const GATE_BANNER = '-- SELF-VERIFYING COMMIT GATE';
function bodiesOf(file) {
  const raw = readFileSync(path.join(MIG, file), 'utf8');
  const i = raw.indexOf(GATE_BANNER);
  if (i < 0) throw new Error(`${file}: expected a SELF-VERIFYING COMMIT GATE banner`);
  // back up to the start of the banner's own comment box
  return raw.slice(0, raw.lastIndexOf('-- ═', i));
}
const BEFORE_SQL = bodiesOf('2026-08-11-raid-claim-authority.sql');
const FIX_SQL_PRISTINE = readFileSync(path.join(MIG, '2026-08-12-raid-band-fairness.sql'), 'utf8');

const A = '11111111-1111-1111-1111-111111111111'; // the strong member
const B = '22222222-2222-2222-2222-222222222222'; // the victim -- NEVER changes
const F = '33333333-3333-3333-3333-333333333333'; // free-rider: joins, never strikes
const T = '44444444-4444-4444-4444-444444444444'; // one-tapper: 1 strike, huge number
const Z = '55555555-5555-5555-5555-555555555555'; // joins after the Hunt is declared
const CLAN = 'aaaaaaaa-0000-0000-0000-00000000000a';

/* THE HUNT, with real numbers off hr_hunt_tiers.
   Tier I declared by a clan of 2 -> pool = 5000 + 3000x2 = 11,000.
   hr_hunt_clamp(11000) = max(5000, 1100) = 5,000 a strike, one strike a UTC
   day. So 5 clamped strikes = 25,000 is an ENTIRELY LEGAL week for one
   player, and 3 small strikes is an entirely legal week for a new one. */
const POOL = 11000, MEMBERS = 2;
const B_DAMAGE = 1800, B_STRIKES = 3;      // the victim, frozen for the whole run

const fail = [];
function check(ok, msg) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${msg}`);
  if (!ok) fail.push(msg);
}

async function build(fixSql) {
  const db = new PGlite();
  await db.exec(FIXTURE);
  await db.exec(BEFORE_SQL);
  if (fixSql) {
    try {
      await db.exec(fixSql);
    } catch (e) {
      await db.close();
      // Re-raised as a plain Error so the selftest can report "caught by the
      // migration's own commit gate" instead of PGlite's 40KB stack dump.
      const err = new Error(e.message);
      err.gate = true;
      throw err;
    }
  }
  const week = (await db.query(`select public.hr_utc_week_key() as w`)).rows[0].w;
  await db.query(
    `insert into public.clans (id,name,created_by,castle_tier) values ($1,'Hearthguard',$2,1)`,
    [CLAN, A]);
  await db.query(
    `insert into public.clan_members (clan_id,user_id,role,joined_at) values
       ($1,$2,'leader',now()-interval '30 days'),
       ($1,$3,'member',now()-interval '30 days'),
       ($1,$4,'member',now()-interval '30 days'),
       ($1,$5,'member',now()-interval '30 days')`, [CLAN, A, B, F, T]);
  await db.query(
    `insert into public.clan_raids
       (clan_id,week_key,boss_id,hp_remaining,max_hp,tier,declared_at,downed_at,members_at_declare)
     values ($1,$2,'emberclad_tyrant',0,$3,1,now()-interval '3 days',now()-interval '1 hour',$4)`,
    [CLAN, week, POOL, MEMBERS]);
  // Z joins AFTER the declaration -- the eligibility control.
  await db.query(
    `insert into public.clan_members (clan_id,user_id,role,joined_at)
     values ($1,$2,'member',now()-interval '2 days')`, [CLAN, Z]);
  return { db, week };
}

async function claimAs(db, uid, week) {
  await db.query(`delete from public.raid_claims where user_id=$1`, [uid]);
  await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [uid]);
  try {
    const r = await db.query(`select public.raid_claim__ungated('clan',$1,$2) as j`, [CLAN, week]);
    return r.rows[0].j;
  } catch (e) { return { RAISED: e.code, message: String(e.message).slice(0, 80) }; }
}
async function setDamage(db, week, uid, damage, strikes) {
  await db.query(
    `insert into public.raid_contributions (clan_id,week_key,user_id,damage,strikes,last_strike_day)
     values ($1,$2,$3,$4,$5,'d') on conflict (clan_id,week_key,user_id)
     do update set damage=excluded.damage, strikes=excluded.strikes`,
    [CLAN, week, uid, damage, strikes]);
}

/* B's verdict as a function of A's week, and NOTHING else. B's own two
   numbers are re-written identically every time so no state can carry over. */
async function victimVerdictAcross(db, week, aDamages) {
  const out = [];
  for (const d of aDamages) {
    await setDamage(db, week, A, d, Math.max(2, Math.ceil(d / 5000)));
    await setDamage(db, week, B, B_DAMAGE, B_STRIKES);
    const v = await claimAs(db, B, week);
    out.push({ a: d, ok: v.ok === true, band: v.band || null, err: v.error || null, scale: v.scale ?? null });
  }
  return out;
}

// A's honest week, from "chipped in like B" up to five clamped strikes.
const A_WEEK = [3000, 6000, 9000, 12000, 17000, 21000, 25000];

async function run(label, fixSql, expect) {
  console.log(`\n──────── ${label} ────────`);
  const { db, week } = await build(fixSql);

  const sweep = await victimVerdictAcross(db, week, A_WEEK);
  for (const s of sweep) {
    console.log(`    A deals ${String(s.a).padStart(6)}  ->  B: ` +
      (s.ok ? `${s.band} x${s.scale}` : `REFUSED (${s.err})`));
  }
  const denied = sweep.filter((s) => !s.ok && s.err === 'below_band');
  const scales = [...new Set(sweep.map((s) => (s.ok ? s.scale : 'DENIED')))];

  if (expect === 'denial') {
    check(sweep[0].ok === true,
      "D1  B is PAID while her clanmate has a quiet week (the mechanic is not just broken for everyone)");
    check(denied.length > 0,
      `D2  B is DENIED (below_band) once her clanmate plays harder -- ${denied.length}/${sweep.length} of A's legal weeks pay B nothing`);
    check(scales.length > 1,
      `D3  B's reward is a FUNCTION OF A's DAMAGE: ${scales.length} distinct outcomes for one unchanged player -- ${JSON.stringify(scales)}`);
  } else {
    check(sweep.every((s) => s.ok === true),
      "F1  B is paid for EVERY legal week her clanmate could have had");
    check(denied.length === 0,
      "F2  below_band is never returned again");
    check(scales.length === 1,
      `F3  B's reward is CONSTANT across A's entire range -- one outcome, ${JSON.stringify(scales)}`);
  }

  // ── CONTROLS. A rule that pays everybody is not a fix. ────────────────
  await setDamage(db, week, A, 25000, 5);
  await setDamage(db, week, B, B_DAMAGE, B_STRIKES);

  const free = await claimAs(db, F, week);              // never struck
  check(free.ok === false && free.error === 'no_contribution',
    `C1  a member who never struck collects NOTHING (got ${JSON.stringify(free.error ?? free)})`);

  await setDamage(db, week, T, 999999, 1);              // one enormous tap
  const tap = await claimAs(db, T, week);
  check(tap.ok === false && tap.error === 'too_few_strikes',
    `C2  one strike is not turning up, however big the number (got ${JSON.stringify(tap.error ?? tap)})`);

  await setDamage(db, week, Z, 25000, 5);              // joined after declaration
  const late = await claimAs(db, Z, week);
  check(late.ok === false && late.error === 'joined_after_declare',
    `C3  joining after the Hunt was declared still pays nothing (got ${JSON.stringify(late.error ?? late)})`);

  const bv = await claimAs(db, B, week);
  const av = await claimAs(db, A, week);
  // C4/C5 are controls on the FIX -- "nobody is denied" must not have been
  // bought by paying everybody the same. On the BEFORE run B is denied
  // outright, which is the defect D2 already reported, so asserting them there
  // would double-count one bug as two.
  if (expect !== 'denial') {
    check(bv.ok === true && av.ok === true && av.scale > bv.scale,
      `C4  effort is still GRADED: A ${av.band} x${av.scale} > B ${bv.band} x${bv.scale}`);
    check(av.band === 'champion' && bv.band === 'partisan',
      `C5  the two ends of the ladder are both reachable in one clan (A=${av.band}, B=${bv.band})`);
  }

  await db.close();
  return { sweep };
}

/* ── SELFTEST ─────────────────────────────────────────────────────────────
   Five mutations of the REAL fix SQL. Each must be CAUGHT by an assertion
   above -- a mutation that survives is reported as SLIPPED and exits non-zero,
   and a mutation whose text does not apply is a harness failure, because that
   is how a planted bug quietly becomes decoration. */
const MUTATIONS = [
  { id: 'M1 the denial restored',
    from: `    when coalesce(p_partial, false) then 'full'\n    else 'partisan'`,
    to:   `    when coalesce(p_partial, false) then 'full'\n    when coalesce(p_damage,0)::numeric / greatest(1, coalesce(p_share,1))::numeric < 0.2 then 'none'\n    else 'partisan'`,
    caught: ['F1', 'F2'] },
  { id: 'M2 everyone gets a full share (the lazy fix)',
    from: `    when coalesce(p_partial, false) then 'full'\n    else 'partisan'`,
    to:   `    when coalesce(p_partial, false) then 'full'\n    else 'full'`,
    caught: ['C4', 'C5'] },
  { id: 'M3 the strike gate removed',
    from: `  if coalesce(v_strikes, 0) < 2 then\n    return jsonb_build_object('ok', false, 'error', 'too_few_strikes', 'strikes', coalesce(v_strikes, 0));\n  end if;`,
    to:   `  if false then\n    return jsonb_build_object('ok', false, 'error', 'too_few_strikes', 'strikes', coalesce(v_strikes, 0));\n  end if;`,
    caught: ['C2'] },
  { id: 'M4 the contribution gate removed',
    from: `  if coalesce(v_damage, 0) <= 0 then\n    return jsonb_build_object('ok', false, 'error', 'no_contribution');\n  end if;`,
    to:   `  if false then\n    return jsonb_build_object('ok', false, 'error', 'no_contribution');\n  end if;`,
    caught: ['C1'] },
  { id: 'M5 the benchmark reads other players again',
    from: `  v_share   := public.hr_hunt_share(v_raid.max_hp, v_members);`,
    to:   `  v_share   := public.hr_hunt_share((select coalesce(sum(damage),0)::bigint from public.raid_contributions\n                 where clan_id = p_clan_id and week_key = v_target), v_members);`,
    caught: ['F3'] }
];

async function selftest() {
  console.log('\n════════ SELFTEST — every mutation of the real fix must be CAUGHT ════════');
  let slipped = 0;
  for (const m of MUTATIONS) {
    if (!FIX_SQL_PRISTINE.includes(m.from)) {
      console.log(`  HARNESS FAILURE  ${m.id}: its anchor text is not in the migration -- the mutation is decoration`);
      slipped++; continue;
    }
    const mutated = FIX_SQL_PRISTINE.replace(m.from, m.to);
    if (mutated === FIX_SQL_PRISTINE) {
      console.log(`  HARNESS FAILURE  ${m.id}: replacement changed nothing`);
      slipped++; continue;
    }
    const before = fail.length;
    try {
      await run(`SELFTEST · ${m.id}`, mutated, 'fixed');
    } catch (e) {
      // A mutation that makes the migration's own commit gate raise is CAUGHT
      // by definition -- that is the gate doing its job.
      console.log(`  caught by the migration's own commit gate: ${String(e.message).slice(0, 120)}`);
      continue;
    }
    const raised = fail.slice(before);
    if (!raised.length) {
      console.log(`  SLIPPED  ${m.id} survived every assertion`);
      slipped++;
    } else {
      console.log(`  caught by: ${raised.map((r) => r.slice(0, 3)).join(', ')}  (expected ${m.caught.join(', ')})`);
      for (const want of m.caught) {
        if (!raised.some((r) => r.startsWith(want))) {
          console.log(`  WEAK     ${m.id}: expected ${want} to catch it and it did not`);
          slipped++;
        }
      }
    }
    fail.length = before;   // mutation failures are expected; do not fail the run
  }
  return slipped;
}

// ── main ────────────────────────────────────────────────────────────────
console.log('raid-band-denial — the Hunt band, before and after 2026-08-12-raid-band-fairness');
console.log(`Tier I pool ${POOL} for ${MEMBERS} members · per-head share ${Math.floor(POOL / MEMBERS)} · ` +
            `clamp 5000/strike\nvictim B: ${B_DAMAGE} damage over ${B_STRIKES} strikes, IDENTICAL in every case`);

await run('BEFORE — the shipped median rule', null, 'denial');
await run('AFTER  — banded against the boss, floored at partisan', FIX_SQL_PRISTINE, 'fixed');

let slipped = 0;
if (process.argv.includes('--selftest')) slipped = await selftest();

console.log('\n════════════════════════════════════════════════════════════════');
if (fail.length || slipped) {
  console.log(`FAILED — ${fail.length} assertion(s), ${slipped} mutation(s) slipped`);
  fail.forEach((f) => console.log(`   · ${f}`));
  process.exit(1);
}
console.log('PASSED — the denial exists on the shipped rule and is gone on the new one,');
console.log('         and a free-rider still collects nothing.');
