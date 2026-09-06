#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/max-hp-tracks-hitpoints.mjs — MAX HP IS THE HITPOINTS LEVEL, ON THE SERVER.
//
// THE BUG (live, found by playing; supabase/migrations/2026-09-06-max-hp-tracks-
// hitpoints.sql has the full write-up). player_state.max_hp was stamped once at
// character creation from hr_start_kit (10) and NOTHING ON THE SERVER EVER MOVED
// IT AGAIN. Every hitpoints-XP writer — hr_apply's xp map (the settle),
// hr_credit_combat_xp (attended combat), the kill goals, the bounty claim, the
// dungeon settle — credits player_skills and never mentions max_hp. The accrual
// engine bumps its OWN copy on a level-up (accrual.js ~1463) and then discards it,
// because hr_apply's delta contract has no `max_hp` key and rejects unknown ones.
// Consequence: every server-resolved fight runs at a 10 HP ceiling and Auto-Eat's
// percentage threshold is scaled to 10 as well.
//
// WHAT THIS GUARD PROVES, on the REAL migration chain in an in-process PostgreSQL
// plus the REAL Edge accrual module — no credentials, production untouched:
//
//   MHP-0  the trigger is installed, on the right event, with the right WHEN
//   MHP-1  a freshly created character's max_hp is its starting hitpoints level
//   MHP-2  ATTENDED: crediting hitpoints XP across a level boundary through the
//          real rate-gated hr_credit_combat_xp moves max_hp to the new level
//   MHP-3  SETTLE: the same through hr_apply, and the settle's own `hp` is
//          clamped to the NEW ceiling in the SAME transaction (ordering)
//   MHP-4  raise-only, idempotent, and the trigger bumps no version
//   MHP-5  headroom: a full-HP character is healed to the new max, an injured
//          one is left where the fight put it, and a DEAD one is not resurrected
//   MHP-6  the BACKFILL fixes a stale row, journals one player_ledger row per
//          corrected character, and does nothing at all on a second run
//   MHP-7  the derivation verbs are not executable by anon / authenticated /
//          service_role / hr_engine
//   MHP-8  no character in the database disagrees with its hitpoints level
//   MHP-9  OFFLINE (no database): the engine knows the new ceiling and the delta
//          it sends CANNOT carry it — which is why the rule has to live in SQL
//
// Run GREEN:  node tests/max-hp-tracks-hitpoints.mjs
// Prove RED:  node tests/max-hp-tracks-hitpoints.mjs --selftest
//
// NO ?v= on the imports (this is tests/**, not a browser module — b332).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, bootReplay } from './schema-replay.mjs';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { xpForLevel } from '../src/core/xp.js';
import { ITEMS } from '../src/data/items.js';
import { MONSTERS } from '../src/data/monsters.js';

const MIG = '2026-09-06-max-hp-tracks-hitpoints.sql';
const N = (v) => Number(v || 0);

/* ── MUTATIONS ─────────────────────────────────────────────────────────────
   Every one is a REAL defect planted in the REAL migration text, and every one
   names the assertion that must catch it. `gate_blind` twins short-circuit the
   migration's own §5 verify block, so the ✓ is this guard's and not the file's.

   Note which mutations the migration CANNOT catch on a fresh replay: the
   backfill runs before any character exists, so a broken backfill applies green
   and only MHP-6 sees it. That is precisely the production case (the backfill is
   the half that runs exactly once, against rows nobody can re-create). */
const MUTATIONS = {
  trigger_never_fires: {
    why: 'THE ACTUAL BUG, restored: the trigger stops matching hitpoints rows, so no credit site '
       + 'moves max_hp ever again (MHP-2/MHP-3)',
    find: "  for each row when (new.skill_id = 'hitpoints')",
    repl: "  for each row when (new.skill_id = 'hitpoints_never')",
  },
  raise_only_dead: {
    why: 'hr_sync_max_hp never finds a row to raise — the derivation exists and writes nothing (MHP-2)',
    find: '     and ps.max_hp  < v_lvl',
    repl: '     and ps.max_hp  < 0',
  },
  wrong_skill: {
    why: 'the derivation reads attack instead of hitpoints — a plausible copy-paste, and max HP '
       + 'silently becomes the wrong stat (MHP-2)',
    find: "      where user_id = p_user and slot = p_slot and skill_id = 'hitpoints'), 0)))",
    repl: "      where user_id = p_user and slot = p_slot and skill_id = 'attack'), 0)))",
  },
  headroom_dropped: {
    why: 'a level-up raises the ceiling but hands the player no HP — the hrSyncMaxHp wasFull arm '
       + 'is gone and a full-HP character sits below its own max (MHP-5)',
    find: '         hp     = case when ps.hp >= ps.max_hp then v_lvl else ps.hp end\n   where ps.user_id = p_user',
    repl: '         hp     = ps.hp\n   where ps.user_id = p_user',
  },
  resurrects_the_dead: {
    why: 'the deliberate divergence from the client rule is lost: a character at 0 HP is healed to '
       + 'full by a level-up — a free rez the server never authored (MHP-5)',
    find: '         hp     = case when ps.hp >= ps.max_hp then v_lvl else ps.hp end\n   where ps.user_id = p_user',
    repl: '         hp     = case when ps.hp >= ps.max_hp or ps.hp <= 0 then v_lvl else ps.hp end\n   where ps.user_id = p_user',
  },
  version_bumped: {
    why: 'the trigger bumps player_state.version, so an honest caller\'s optimistic-concurrency '
       + 'arithmetic starts depending on whether a level-up happened inside its own call (MHP-4)',
    find: '     set max_hp = v_lvl,\n         hp     = case when ps.hp >= ps.max_hp then v_lvl else ps.hp end\n   where ps.user_id = p_user',
    repl: '     set max_hp = v_lvl,\n         version = ps.version + 1,\n         hp     = case when ps.hp >= ps.max_hp then v_lvl else ps.hp end\n   where ps.user_id = p_user',
  },
  backfill_noop: {
    why: 'the one-time backfill corrects nothing — every character alive today keeps max_hp 10 '
       + 'until it next levels hitpoints, and on a fresh replay the migration\'s own VERIFY cannot '
       + 'see it because there are no characters yet (MHP-6)',
    find: '     and ps.max_hp < d.new_max\n  returning',
    repl: '     and false\n  returning',
  },
  backfill_not_journalled: {
    why: 'characters are corrected with no audit trail — an administrative write to a player row '
       + 'that no ledger row explains (MHP-6)',
    find: '  from fixed f;',
    repl: '  from fixed f where false;',
  },
  /* NOTE the shape of this one. Simply DELETING the revoke is not a defect on
     this database: 2026-08-11-anon-execute-lockdown.sql sets `alter default
     privileges … revoke execute on functions from public, anon, authenticated`,
     so a new function is born unreachable and the revoke lines are belt-and-
     braces. The realistic regression is the opposite — a grant copy-pasted from
     a neighbouring client-facing verb (hr_credit_combat_xp carries exactly such
     a line two files away). So the mutation PLANTS one. */
  client_executable_gate_blind: {
    why: 'hr_sync_max_hp — a SECURITY DEFINER verb that WRITES player_state — is granted to '
       + 'authenticated, with the migration\'s own §5(c) assertion short-circuited so only this '
       + 'guard can see it (MHP-7)',
    find: 'revoke execute on function public.hr_sync_max_hp(uuid, int)\n'
        + '  from public, anon, authenticated, service_role, hr_engine;',
    repl: 'revoke execute on function public.hr_sync_max_hp(uuid, int)\n'
        + '  from public, anon, authenticated, service_role, hr_engine;\n'
        + 'grant execute on function public.hr_sync_max_hp(uuid, int) to authenticated;',
    also: [[
      "  if v_n > 0 then\n    raise exception 'VERIFY(c):",
      "  if false then\n    raise exception 'VERIFY(c):",
    ]],
  },
};

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  FAIL  ${msg}`); } };

// ── MHP-9 · OFFLINE: the engine knows, and the wire cannot carry it ────────
// Runs with no database at all, so it still asserts something on a machine
// without PGlite. A character one XP short of hitpoints 11, fighting attended,
// levels on the first kill: the engine's own summary carries the new ceiling
// (accrual.js ~1463/1546) and the delta it hands hr_apply does NOT — which is
// the whole reason max_hp has to be derived in SQL rather than shipped.
function offlineDeltaContract() {
  const MONSTER = MONSTERS.goblin ? 'goblin' : Object.keys(MONSTERS)[0];
  const FOOD = ITEMS.cooked_shrimp ? 'cooked_shrimp'
    : Object.keys(ITEMS).find((k) => ITEMS[k] && ITEMS[k].foodClass === 'healing');
  const fromMs = Date.UTC(2026, 2, 14, 12, 0, 0);
  const hpXp = xpForLevel(11) - 1;             // one XP short of the next level
  const r = computeAccrual({
    userId: '00000000-0000-4000-8000-0000000000aa',
    slot: 0, nowMs: fromMs + 3600000, accruedToMs: fromMs, activeSinceMs: fromMs,
    activeKind: 'combat', activeId: MONSTER, capMs: 3600000, seed: 0x5eed0006,
    hp: 10, maxHp: 10, gold: 0,
    skills: {
      attack: 13034431, strength: 13034431, defense: 13034431,
      ranged: 1154, magic: 1154, prayer: 1154, hitpoints: hpXp,
    },
    equipment: {}, items: ITEMS, monsters: MONSTERS,
    autoEatEnabled: true, autoEatFood: FOOD, autoEatPct: 80,
    inventory: FOOD ? { [FOOD]: 100000 } : {},
  });
  ok(r && r.accrued === true, `MHP-9 FIXTURE: the offline span did not accrue (${r && r.reason})`);
  if (!r || !r.accrued) return;
  const crossed = (r.levelUps || []).filter((l) => l && l.skill === 'hitpoints');
  ok(crossed.length > 0,
    'MHP-9 FIXTURE: the span crossed no hitpoints level, so everything below is vacuous');
  ok(N(r.delta.hp) > 10,
    `MHP-9(a): the engine ended the span at hp ${r.delta.hp} with an input ceiling of 10 — it DOES raise `
    + 'its own copy on a level-up (accrual.js ~1463). If this ever drops to <= 10 the fixture stopped '
    + 'levelling and (b) proves nothing.');
  ok(!('max_hp' in r.delta) && !('maxHp' in r.delta) && !('maxHp' in (r.summary || {})),
    'MHP-9(b): the accrual result now carries a max_hp/maxHp key. It carries NONE today — the raised '
    + 'ceiling is used to clamp hp inside the span and then discarded at the transport boundary, which '
    + 'is exactly why hr_apply used to clamp that hp back down to the stale 10 (MHP-3 is the other half). '
    + 'hr_apply must NEVER accept an Edge-proposed absolute ceiling: the server derives it from XP. '
    + 'If a key is wanted here, the apply contract gets reviewed — it does not get widened in passing.');
}

async function boot(mutate) {
  let patches;
  if (mutate) {
    const m = MUTATIONS[mutate];
    patches = new Map([[m.file || MIG, [[m.find, m.repl], ...(m.also || [])]]]);
  }
  return bootReplay({ patches, upTo: MIG });
}

/* The §4 backfill, lifted VERBATIM out of the migration so MHP-6 exercises the
   shipped statement rather than a paraphrase of it. */
async function backfillSql(mutate) {
  let src = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  /* THE SAME PATCH THE CHAIN GOT. bootReplay mutates an IN-MEMORY copy, so a
     slice read back off disk is the PRISTINE statement and a backfill mutation
     is silently un-planted — which is how a mutation harness starts grading
     decoration as caught. Measured while writing this file: backfill_noop and
     backfill_not_journalled both "stayed green" until this existed. */
  if (mutate) {
    const m = MUTATIONS[mutate];
    for (const [find, repl] of [[m.find, m.repl], ...(m.also || [])]) {
      if (src.split(find).length - 1 === 1) src = src.replace(find, () => repl);
    }
  }
  const a = src.indexOf('-- ── 4. THE BACKFILL');
  const b = src.indexOf('-- ── 5. VERIFY');
  if (a < 0 || b < 0 || b <= a) {
    const e = new Error('HARNESS: could not slice §4 out of ' + MIG + ' — the section markers moved');
    e.harness = true; throw e;
  }
  return src.slice(a, b);
}

async function runAll(db, mutate) {
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
  const asEngine = async (sql, p) => {
    await q('set role hr_engine');
    try { return (await db.query(sql, p)).rows[0]?.r; }
    finally { await db.query('reset role').catch(() => {}); }
  };
  const gate = () => q('delete from public.hr_rate_counters');

  const stateOf = async (uid, slot = 0) => (await q(
    'select max_hp, hp, version::text v from public.player_state where user_id=$1 and slot=$2',
    [uid, slot]))[0];
  const hpXpOf = async (uid, slot = 0) => N((await q(
    "select xp::text v from public.player_skills where user_id=$1 and slot=$2 and skill_id='hitpoints'",
    [uid, slot]))[0]?.v);
  const levelOf = async (xp) => N((await q('select public.hr_level_from_xp($1::bigint) as v', [xp]))[0].v);

  const mkPlayer = async (tag) => {
    const uid = (await q('select gen_random_uuid() as i'))[0].i;
    await q('insert into auth.users (id, instance_id, aud, role, email) '
      + "values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2)",
    [uid, `${tag}@maxhp.invalid`]);
    await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
    await gate();
    await asUser(uid, 'select public.claim_display_name($1) as r', [tag]);
    await gate();
    const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
    ok(cr?.ok === true, `FIXTURE(${tag}): hr_create_character refused: ${JSON.stringify(cr)}`);
    return uid;
  };

  // ── MHP-0 · CONTROL: the hook exists and is the one this file describes ──
  {
    const def = (await q("select pg_get_triggerdef(t.oid) as d from pg_trigger t "
      + "where t.tgrelid='public.player_skills'::regclass and t.tgname='hr_player_skills_max_hp' "
      + 'and not t.tgisinternal'))[0]?.d || '';
    ok(/AFTER INSERT OR UPDATE OF xp/i.test(def),
      `MHP-0: the trigger is not AFTER INSERT OR UPDATE OF xp on player_skills — got: ${def || '(absent)'}`);
    ok(/FOR EACH ROW/i.test(def) && /hitpoints/.test(def),
      `MHP-0: the trigger is not a per-row hitpoints hook — got: ${def || '(absent)'}`);
  }

  // ── MHP-1 · a fresh character starts at its own hitpoints level ──────────
  const A = await mkPlayer('MaxHpA');
  {
    const st = await stateOf(A);
    const lvl = await levelOf(await hpXpOf(A));
    ok(N(st.max_hp) === lvl,
      `MHP-1: a new character's max_hp is ${st.max_hp} but its hitpoints level is ${lvl}`);
    ok(lvl === 10,
      `MHP-1 FIXTURE: hr_start_kit no longer buys hitpoints level 10 (got ${lvl}) — re-read the kit `
      + 'before trusting the numbers below');
  }

  // ── MHP-2 · ATTENDED: hr_credit_combat_xp across a level boundary ────────
  {
    // The credit's cap is a function of elapsed time since the watermark, and a
    // character created a millisecond ago has none. Back-date the two server
    // clocks the RPC reads — not a client value, the server's own columns.
    await q(`update public.player_state set accrued_to = now() - interval '6 hours',
                    combat_xp_accrued_to = now() - interval '6 hours'
              where user_id=$1 and slot=0`, [A]);
    const before = await stateOf(A);
    const xpBefore = await hpXpOf(A);
    await gate();
    const r = await asUser(A, 'select public.hr_credit_combat_xp(0, $1::jsonb, $2) as r',
      [JSON.stringify({ hitpoints: 6000 }), 'maxhp-attended-1']);
    ok(r?.ok === true, `MHP-2: hr_credit_combat_xp refused: ${JSON.stringify(r)}`);
    const xpAfter = await hpXpOf(A);
    ok(xpAfter > xpBefore, `MHP-2 FIXTURE: no hitpoints XP was credited (${xpBefore} -> ${xpAfter})`);
    const lvl = await levelOf(xpAfter);
    ok(lvl > N(before.max_hp),
      `MHP-2 FIXTURE: the credit did not cross a level (${before.max_hp} -> ${lvl}) — the assertion below is vacuous`);
    const st = await stateOf(A);
    ok(N(st.max_hp) === lvl,
      `MHP-2: after an ATTENDED credit max_hp is ${st.max_hp} but the hitpoints level is ${lvl} — `
      + 'this is the live bug (QA slot 2: hitpoints 12, max_hp 10)');
  }

  // ── MHP-4 · raise-only, idempotent, and no version churn from the hook ───
  {
    const before = await stateOf(A);
    // A second, unrelated skill write must not disturb it...
    await q(`insert into public.player_skills (user_id, slot, skill_id, xp) values ($1,0,'attack',5000)
             on conflict (user_id, slot, skill_id) do update set xp = 5000`, [A]);
    let st = await stateOf(A);
    ok(N(st.max_hp) === N(before.max_hp), `MHP-4: an attack-XP write moved max_hp (${before.max_hp} -> ${st.max_hp})`);
    // ...and a hitpoints write that crosses no level must change nothing at all,
    // including the version (the row is the caller's to bump, not the trigger's).
    await q("update public.player_skills set xp = xp + 1 where user_id=$1 and slot=0 and skill_id='hitpoints'", [A]);
    st = await stateOf(A);
    ok(N(st.max_hp) === N(before.max_hp), `MHP-4: a sub-level hitpoints write moved max_hp`);
    ok(st.v === before.v,
      `MHP-4: the trigger bumped player_state.version (${before.v} -> ${st.v}) — optimistic concurrency `
      + 'belongs to the calling RPC, which bumps it once itself');
    // ...and neither does a write that DOES raise the ceiling. That is the arm
    // that matters: the no-op above would pass even if the UPDATE bumped the
    // version, because on a no-op the UPDATE never runs.
    const v0 = st.v;
    await q("update public.player_skills set xp = $2 where user_id=$1 and slot=0 and skill_id='hitpoints'",
      [A, xpForLevel(50)]);
    st = await stateOf(A);
    ok(N(st.max_hp) === 50, `MHP-4 FIXTURE: a raising write did not land (max_hp ${st.max_hp}, expected 50)`);
    ok(st.v === v0,
      `MHP-4: the trigger bumped player_state.version on a RAISING write (${v0} -> ${st.v}) — optimistic `
      + 'concurrency belongs to the calling RPC, which bumps it exactly once itself');
    // Raise-only: max_hp never falls, even if XP somehow did.
    const lvlNow = await levelOf(await hpXpOf(A));
    ok(N(st.max_hp) >= lvlNow, 'MHP-4: max_hp fell below the hitpoints level');
  }

  // ── MHP-3 · SETTLE: hr_apply, and the hp clamp sees the NEW ceiling ──────
  {
    const before = await stateOf(A);
    const xpBefore = await hpXpOf(A);
    const target = await levelOf(xpBefore + 40000);
    ok(target > N(before.max_hp), 'MHP-3 FIXTURE: the settle delta does not cross a level');
    const intent = (await q('select gen_random_uuid() as i'))[0].i;
    // `hp` is the engine's own absolute, computed against ITS raised ceiling.
    // Before this fix hr_apply clamped it to the stale 10 in the same statement.
    const delta = { xp: { hitpoints: 40000 }, hp: target, journal: { kind: 'accrue', intent: 'accrue' } };
    const res = await asEngine('select public.hr_apply($1::uuid,0,$2::bigint,$3::uuid,$4::jsonb) as r',
      [A, before.v, intent, JSON.stringify(delta)]);
    ok(res?.ok !== false, `MHP-3: hr_apply refused: ${JSON.stringify(res)}`);
    const st = await stateOf(A);
    const lvl = await levelOf(await hpXpOf(A));
    ok(N(st.max_hp) === lvl, `MHP-3: after a SETTLE max_hp is ${st.max_hp}, hitpoints level ${lvl}`);
    ok(N(st.hp) === target,
      `MHP-3: the settle's hp was clamped to ${st.hp} instead of ${target} — the xp credit and the hp `
      + 'clamp are in one transaction, so the raised ceiling MUST be visible to the clamp');
  }

  // ── MHP-5 · headroom: full heals, injured is left alone, dead stays dead ─
  {
    const mk = async (tag, hp, hpXp) => {
      const uid = await mkPlayer(tag);
      await q(`update public.player_skills set xp = $2 where user_id=$1 and slot=0 and skill_id='hitpoints'`,
        [uid, hpXp]);
      // The write above already synced the ceiling; now stage the HP under test.
      await q('update public.player_state set hp = $2 where user_id=$1 and slot=0', [uid, hp]);
      return uid;
    };
    const lvl20 = xpForLevel(20);
    const lvl30 = xpForLevel(30);

    const full = await mk('MaxHpFull', 20, lvl20);
    await q(`update public.player_skills set xp = $2 where user_id=$1 and slot=0 and skill_id='hitpoints'`, [full, lvl30]);
    let st = await stateOf(full);
    ok(N(st.max_hp) === 30 && N(st.hp) === 30,
      `MHP-5(a): a character at FULL HP was not handed the new headroom (hp ${st.hp}/${st.max_hp}, expected 30/30)`);

    const hurt = await mk('MaxHpHurt', 7, lvl20);
    await q(`update public.player_skills set xp = $2 where user_id=$1 and slot=0 and skill_id='hitpoints'`, [hurt, lvl30]);
    st = await stateOf(hurt);
    ok(N(st.max_hp) === 30 && N(st.hp) === 7,
      `MHP-5(b): an INJURED character was healed by a level-up (hp ${st.hp}/${st.max_hp}, expected 7/30) — `
      + 'the ceiling moves, the fight\'s damage does not un-happen');

    const dead = await mk('MaxHpDead', 0, lvl20);
    await q(`update public.player_skills set xp = $2 where user_id=$1 and slot=0 and skill_id='hitpoints'`, [dead, lvl30]);
    st = await stateOf(dead);
    ok(N(st.max_hp) === 30 && N(st.hp) === 0,
      `MHP-5(c): a character at 0 HP was RESURRECTED by a level-up (hp ${st.hp}/${st.max_hp}, expected 0/30) — `
      + 'the client\'s `|| !(hp>0)` arm is deliberately not copied; death is the server\'s to decide');
  }

  // ── MHP-6 · THE BACKFILL, on a deliberately stale row ────────────────────
  {
    const B = await mkPlayer('MaxHpStale');
    const xp = xpForLevel(41);
    await q(`update public.player_skills set xp = $2 where user_id=$1 and slot=0 and skill_id='hitpoints'`, [B, xp]);
    // Reproduce the LIVE state: high hitpoints XP, max_hp still at the kit's 10.
    // Written straight to the column (there is no trigger on player_state), which
    // is exactly the shape production is in — the XP was credited by RPCs that
    // never touched the ceiling.
    await q('update public.player_state set max_hp = 10, hp = 10 where user_id=$1 and slot=0', [B]);
    const stale = await stateOf(B);
    ok(N(stale.max_hp) === 10, 'MHP-6 FIXTURE: could not stage a stale max_hp');

    const sql = await backfillSql(mutate);
    const ledgerBefore = N((await q(
      "select count(*)::text c from public.player_ledger where kind='admin' and intent='max_hp_derive'"))[0].c);
    await db.exec(sql);

    const lvl = await levelOf(xp);
    const st = await stateOf(B);
    ok(N(st.max_hp) === lvl,
      `MHP-6(a): the backfill left max_hp at ${st.max_hp} for a hitpoints-${lvl} character — every `
      + 'character alive today is in exactly this state');
    ok(N(st.hp) === lvl, `MHP-6(a): the backfilled character was at full HP and was not given the headroom (hp ${st.hp})`);

    const rows = await q("select user_id, slot, xp::text x, meta from public.player_ledger "
      + "where kind='admin' and intent='max_hp_derive' order by at desc");
    ok(rows.length === ledgerBefore + 1,
      `MHP-6(b): the backfill journalled ${rows.length - ledgerBefore} row(s), expected exactly 1 per `
      + 'corrected character — an administrative write to a player row with no audit trail');
    const meta = rows[0] && rows[0].meta;
    ok(!!meta && N(meta.max_hp_from) === 10 && N(meta.max_hp_to) === lvl && meta.fix === 'max_hp_tracks_hitpoints',
      `MHP-6(b): the ledger row does not state what moved: ${JSON.stringify(meta)}`);

    // IDEMPOTENT: a second run corrects nothing and journals nothing.
    await db.exec(sql);
    const after = N((await q(
      "select count(*)::text c from public.player_ledger where kind='admin' and intent='max_hp_derive'"))[0].c);
    ok(after === rows.length,
      `MHP-6(c): re-running the backfill journalled ${after - rows.length} more row(s) — it is not idempotent`);
  }

  // ── MHP-7 · the derivation verbs are server-only ─────────────────────────
  {
    const bad = await q(`select p.proname, r.rolname from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        cross join pg_roles r
       where n.nspname='public'
         and p.proname in ('hr_max_hp_for','hr_sync_max_hp','hr_player_skills_max_hp')
         and r.rolname in ('anon','authenticated','service_role','hr_engine')
         and has_function_privilege(r.oid, p.oid, 'EXECUTE')`);
    ok(bad.length === 0,
      `MHP-7: ${bad.length} client-role EXECUTE grant(s) on the max_hp verbs: `
      + bad.map((b) => `${b.rolname}->${b.proname}`).join(', ')
      + '. hr_sync_max_hp WRITES player_state; a privileged verb left executable by authenticated is '
      + 'the whole game, and hr_engine is on the list because Edge Functions never write tables.');
    const n = await q(`select count(*)::text c from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname in ('hr_max_hp_for','hr_sync_max_hp','hr_player_skills_max_hp')`);
    ok(N(n[0].c) === 3, `MHP-7 CONTROL: expected 3 max_hp verbs, found ${n[0].c} — the check above may be vacuous`);
  }

  // ── MHP-8 · the invariant, over every row in the database ────────────────
  {
    const bad = await q(`select ps.user_id, ps.slot, ps.max_hp,
             greatest(1, public.hr_level_from_xp(coalesce(sk.xp,0))) as lvl
        from public.player_state ps
        left join public.player_skills sk
          on sk.user_id=ps.user_id and sk.slot=ps.slot and sk.skill_id='hitpoints'
       where ps.max_hp <> greatest(1, public.hr_level_from_xp(coalesce(sk.xp,0)))`);
    ok(bad.length === 0,
      `MHP-8: ${bad.length} character(s) disagree with their hitpoints level — `
      + bad.slice(0, 3).map((b) => `${b.slot}:${b.max_hp}<>${b.lvl}`).join(', '));
    const total = N((await q('select count(*)::text c from public.player_state'))[0].c);
    ok(total >= 5, `MHP-8 CONTROL: only ${total} characters exist — the sweep above is nearly vacuous`);
  }
}

// ── entry point ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2);

if (argv.includes('--selftest')) {
  console.log('max-hp-tracks-hitpoints --selftest: each mutation must turn the guard RED');
  // A clean control FIRST: a harness that is red for its own reasons grades
  // every mutation as caught.
  {
    const { db } = await boot(null);
    offlineDeltaContract();
    await runAll(db, null);
    if (failed) {
      console.error(`\nCONTROL RUN IS RED (${failed} assertion(s)) — every "caught" below would be a lie.`);
      process.exit(2);
    }
    console.log('  control: GREEN');
  }
  let bad = 0;
  for (const name of Object.keys(MUTATIONS)) {
    failed = 0; let threw = false; let harness = false;
    try { const { db } = await boot(name); await runAll(db, name); }
    catch (e) {
      threw = true; harness = !!e.harness;
      console.log(`  ${name}: ${harness ? 'HARNESS' : 'RED'} (threw: ${String(e.message).split('\n')[0]})`);
    }
    if (harness) { console.error(`  x ${name}: HARNESS problem — the anchor did not plant`); process.exit(2); }
    const wentRed = failed > 0 || threw;
    if (wentRed) { if (!threw) console.log(`  ${name}: RED — ${MUTATIONS[name].why}`); }
    else { bad++; console.error(`  x ${name}: STAYED GREEN — the guard does not catch: ${MUTATIONS[name].why}`); }
  }
  failed = 0;
  if (bad) { console.error(`\n${bad} mutation(s) not caught.`); process.exit(1); }
  console.log(`\nAll ${Object.keys(MUTATIONS).length} mutations caught. The guard is non-vacuous.`);
  process.exit(0);
} else if (argv.includes('--offline')) {
  // The half that needs no PostgreSQL, for a machine without PGlite.
  offlineDeltaContract();
  if (failed) { console.error(`\nmax-hp-tracks-hitpoints --offline: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('max-hp-tracks-hitpoints --offline: the engine raises its own ceiling and the delta cannot carry it.');
  process.exit(0);
} else {
  offlineDeltaContract();
  const { db } = await boot(null);
  await runAll(db, null);
  if (failed) { console.error(`\nmax-hp-tracks-hitpoints: ${failed} assertion(s) FAILED.`); process.exit(1); }
  console.log('max-hp-tracks-hitpoints: max_hp tracks the hitpoints level through the attended credit, the '
    + 'settle and a direct write; raise-only, no version churn, headroom for the living only; the backfill '
    + 'corrects a stale row once and journals it. No character disagrees with its level.');
  process.exit(0);
}
