// ════════════════════════════════════════════════════════════════════════
// tests/leaderboard-server-source.mjs — CAN A FORGED SAVE STILL BUY A RANK?
//
//   node tests/leaderboard-server-source.mjs            # the guard
//   node tests/leaderboard-server-source.mjs --mutate   # plant defects, prove RED
//
// Ships with: supabase/migrations/2026-08-18-leaderboard-server-source.sql
//
// ── THE DEFECT CLASS THIS EXISTS FOR ────────────────────────────────────
// `public.leaderboard_ranked` was a materialized view over
// `game_saves.snapshot` — the CLIENT-AUTHORED save blob. Every board read a
// number the ranked player typed:
//
//     G.gold = 1e12  →  autosave  →  #1 on Wealth
//
// and the same line took Total Level, Combat Level, all seventeen skill boards,
// Renown and Bosses. CLAUDE.md save-invariant #6 carried this as a documented
// limitation ("leaderboard values are self-forgeable"). Security condition S2
// required it rebuilt over server tables.
//
// ── WHY THIS FILE ASSERTS BOTH DIRECTIONS ───────────────────────────────
// "A forged snapshot no longer moves a board" is trivially satisfiable by a
// broken migration: a view that ranks nothing at all passes it perfectly. So
// every negative here is paired with a POSITIVE — a legitimate, server-written
// player_skills / player_state change that MUST move the same board. A guard
// that only proves the forgery is dead cannot tell the difference between a
// security fix and a leaderboard outage.
//
// ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────
//   · PGlite is ONE backend. `refresh materialized view concurrently` and the
//     advisory lock in hr_leaderboard_refresh are exercised but never contended.
//   · It cannot see the RENDERED screen. The read shape is asserted field by
//     field against what src/features/leaderboards.js reduceBoard() consumes
//     (LB-7), which is the contract — but a browser pass is still owed.
//   · It does not prove production is in the state §0 gates for. That is a live
//     query, not a replay.
// ════════════════════════════════════════════════════════════════════════
import { bootReplay, ROOT } from './schema-replay.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };

const FORGER = '000000bb-0000-4000-a000-0000000000f1';
const HONEST = '000000bb-0000-4000-a000-0000000000f2';

/* Numbers no honest player can reach, so if one appears on a board it can only
   have come from the blob.

   ⚠ FORGED_TOTAL IS 4999, NOT SOMETHING ABSURD, AND THAT MAKES THIS A STRICTLY
     STRONGER TEST. 2026-08-10-save-integrity.sql's hr_guard_game_save() trigger
     already REFUSES a snapshot whose totalLevel exceeds 5000 (c_max_total_level
     :49) — measured here: an insert at 2e9 raises 23514 and never reaches the
     board at all. A forgery that the existing guard bounces proves nothing
     about THIS migration. 4999 sails through every guard the database has,
     beats the real live leader (769, per that file's comment) by a factor of
     six, and would have taken rank #1 on Total Level. Gold and per-skill XP are
     not ceilinged by that trigger at all, so those two need no such care. */
const FORGED_GOLD = 999999999999;
const FORGED_TOTAL = 4999;
const FORGED_XP = 999999999;
const FORGED_NAME = 'Lord Impersonator';

export async function guard() {
  let db;
  try { ({ db } = await bootReplay()); } catch (e) {
    problems.push(`LB-SQL: the migration chain would not apply — ${e.message}`);
    return problems;
  }

  const q = async (sql, args) => (await db.query(sql, args)).rows;
  const one = async (sql, args) => (await q(sql, args))[0];

  const mkPlayer = async (uid, name) => {
    await db.query('insert into auth.users(id) values ($1) on conflict (id) do nothing', [uid]);
    await db.query('insert into profiles(id, display_name) values ($1,$2) '
      + 'on conflict (id) do update set display_name = excluded.display_name', [uid, name]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    const r = (await db.query('select hr_create_character(0) r')).rows[0].r;
    if (r.ok !== true) throw new Error(`hr_create_character failed for ${name}: ${JSON.stringify(r)}`);
  };

  try {
    await mkPlayer(FORGER, 'Forger');
    await mkPlayer(HONEST, 'Honest');
  } catch (e) {
    problems.push(`LB-SQL: fixture could not create characters — ${e.message}`);
    return problems;
  }

  const versions = {};
  for (const uid of [FORGER, HONEST]) {
    versions[uid] = Number((await one(
      'select version::text v from player_state where user_id=$1 and slot=0', [uid])).v);
  }
  let n = 0;
  const apply = async (uid, delta) => {
    await db.exec('set role hr_engine');
    let r;
    try {
      r = (await db.query('select hr_apply($1,0,$2,$3,$4::jsonb) r',
        [uid, versions[uid], `00000000-0000-4000-d000-${String(++n).padStart(12, '0')}`,
          JSON.stringify(delta)])).rows[0].r;
    } catch (e) { r = { ok: false, error: '__exception', message: e.message }; }
    await db.exec('reset role');
    if (r && r.ok === true) versions[uid] += 1;
    return r;
  };

  const refresh = async () => { await db.exec('refresh materialized view leaderboard_ranked'); };
  /** One player's row on one board, straight off the matview. */
  const rowOf = async (board, uid) => (await q(
    'select score::text score, rank::text rank, name, saved_at from leaderboard_ranked '
    + 'where board=$1 and subject_id=$2', [board, uid]))[0] || null;
  const scoreOf = async (board, uid) => {
    const r = await rowOf(board, uid);
    return r ? Number(r.score) : null;
  };
  const board = async (uid, b) => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    return (await db.query('select hr_leaderboard($1,25,1) r', [b])).rows[0].r;
  };

  // ── LB-0 — FIXTURE PRECONDITIONS, FIRST AND LOUDLY. ──────────────────────
  // Everything below grades a rebuilt view. If the view were never rebuilt, or
  // the predecessor never applied, several assertions would pass anyway.
  const skills = (await one('select hr_lb_skills() s')).s;
  ok(Array.isArray(skills) && skills.includes('stonemason') && skills.length === 17,
    `LB-0: hr_lb_skills() is ${Array.isArray(skills) ? skills.length : '?'} entries and the `
    + 'predecessor gate term "stonemason" is missing — the chain did not apply '
    + '2026-08-17-leaderboard-skills.sql, so the migration under test refused to install and '
    + 'every assertion below is grading the OLD blob-sourced view.');

  const depSaves = Number((await one(
    `select count(*)::text c from pg_depend d join pg_rewrite r on r.oid=d.objid
      where d.classid='pg_rewrite'::regclass and r.ev_class='leaderboard_ranked'::regclass
        and d.refobjid='game_saves'::regclass`)).c);
  const depState = Number((await one(
    `select count(*)::text c from pg_depend d join pg_rewrite r on r.oid=d.objid
      where d.classid='pg_rewrite'::regclass and r.ev_class='leaderboard_ranked'::regclass
        and d.refobjid='player_state'::regclass`)).c);
  ok(depState > 0,
    'LB-0 (the POSITIVE control): leaderboard_ranked does not depend on player_state, so the '
    + 'pg_depend probe is measuring nothing and LB-0\'s game_saves check cannot fail honestly.');
  ok(depSaves === 0,
    'LB-0: leaderboard_ranked STILL depends on game_saves — the boards are still ranking the '
    + 'client-authored save blob and S2 is open.');

  // ── LB-9 — BOOTSTRAP VALUES, NOT NULL, NOT ABSENT. ───────────────────────
  // Asserted BEFORE anything is forged or granted, on a character that has done
  // nothing at all. A rebuild that NULL-crashed or dropped fresh players would
  // look identical to a working one under every forgery assertion below.
  //
  // ⚠ THE EXPECTATION IS COMPUTED FROM src/core/xp.js AGAINST THE ROWS THAT
  //   ACTUALLY EXIST, not hardcoded. The first draft of this asserted 17 (one
  //   level per seeded skill) and 1 — both WRONG, because hr_create_character's
  //   start kit seeds hitpoints at level 10, so a fresh character is total 26,
  //   combat 3. A hardcoded number here would have to be re-guessed every time
  //   the start kit moves, and guessing is what produced the red. Deriving it
  //   in JS also makes this an independent cross-check of the SQL view against
  //   the client's own maths, which is worth more than the constant was.
  await refresh();
  const xp = await import(pathToFileURL(join(ROOT, 'src', 'core', 'xp.js')).href);
  const skillXp = Object.fromEntries((await q(
    'select skill_id, xp::text xp from player_skills where user_id=$1 and slot=0', [HONEST]))
    .map((r) => [r.skill_id, Number(r.xp)]));
  ok(Object.keys(skillXp).length > 0,
    'LB-9 (the FIXTURE control): hr_create_character seeded no player_skills rows, so the '
    + 'bootstrap expectations below are computed from nothing.');
  const wantTotal = xp.totalLevel(skillXp);
  const wantCombat = xp.combatLevel(skillXp);
  const freshTotal = await scoreOf('total_level', HONEST);
  ok(freshTotal === wantTotal,
    `LB-9: a freshly bootstrapped character scores ${freshTotal} on total_level; src/core/xp.js `
    + `totalLevel() over the SAME seeded rows says ${wantTotal}. null means the player fell out of `
    + 'the view entirely (the "no server rows -> NULL" crash this rebuild had to avoid); a '
    + 'mismatch means the server and the client disagree about the player\'s own level.');
  const freshCombat = await scoreOf('combat_level', HONEST);
  ok(freshCombat === wantCombat,
    `LB-9: a fresh character's combat_level is ${freshCombat}, src/core/xp.js says ${wantCombat}. `
    + 'The coalesce default for an absent skill row must be level 1, matching levelOf().');
  ok(freshTotal != null && freshCombat != null,
    'LB-9: a bootstrapped character with no activity must still RANK, at bootstrap values.');

  /* ── LB-9b — A CHARACTER WITH A MISSING SKILL ROW STILL RANKS CORRECTLY. ──
     This is the state 2026-08-18-skill-row-upsert.sql exists for: per-skill
     rows are seeded ONCE at character creation and the catalogue GROWS
     afterwards, so every character older than a skill LACKS that skill's row.
     The view left-joins and coalesces the missing level to 1 — matching
     src/core/xp.js levelOf(), which returns levelFromXp(0) = 1 for an absent
     key — and getting that default wrong is a silent, permanent disagreement
     between the board and the player's own screen.

     ⚠ THE FIXTURE IS TUNED TO DISCRIMINATE, AND IT HAD TO BE MEASURED.
       At bootstrap values (strength 1, hitpoints 10) a coalesce of 0 and a
       coalesce of 1 BOTH yield combat level 3 — the difference of 0.325 does
       not cross a floor boundary — so the obvious version of this test passes
       against the wrong default. Strength is first raised to level 3, where the
       two answers are 4 and 3. Verified by mutation (M6). */
  const strengthGrant = await apply(HONEST, { xp: { strength: xp.XP_TABLE[2] } });
  ok(strengthGrant && strengthGrant.ok === true,
    `LB-9b: the strength grant was refused — ${JSON.stringify(strengthGrant)}`);
  const del = await db.query(
    'delete from player_skills where user_id=$1 and slot=0 and skill_id=$2', [HONEST, 'attack']);
  ok(del.affectedRows === 1,
    `LB-9b (the FIXTURE control): the delete removed ${del.affectedRows} rows, expected 1 — the `
    + 'character never had an attack row, so the missing-row case is not what is being tested.');
  await refresh();
  const partial = Object.fromEntries((await q(
    'select skill_id, xp::text xp from player_skills where user_id=$1 and slot=0', [HONEST]))
    .map((r) => [r.skill_id, Number(r.xp)]));
  ok(!('attack' in partial),
    'LB-9b (the FIXTURE control): the attack row survived the delete.');
  const gapCombat = await scoreOf('combat_level', HONEST);
  ok(gapCombat === xp.combatLevel(partial),
    `LB-9b: with no attack row the board says combat level ${gapCombat}; src/core/xp.js over the `
    + `same remaining rows says ${xp.combatLevel(partial)}. The left join must treat a missing `
    + 'skill row as level 1, not 0 and not NULL.');
  ok(gapCombat != null,
    'LB-9b: a character with a missing skill row fell off the combat board entirely — an inner '
    + 'join where a left join belongs.');
  ok(await scoreOf('total_level', HONEST) === xp.totalLevel(partial),
    'LB-9b: total_level disagrees with src/core/xp.js totalLevel() over the remaining rows.');

  // ── LB-1 — THE FORGERY. A hand-written save blob moves NOTHING. ──────────
  // This is the exploit, executed. The insert is what the live client does on
  // autosave, and RLS permits it (game_saves is the player's own row) — so this
  // is not a privilege the fix removes, it is a privilege the fix makes useless.
  const forged = {
    gold: FORGED_GOLD,
    totalLevel: FORGED_TOTAL,
    combatLevel: 126,
    renown: 999999,
    bossKills: 999999,
    playerName: FORGED_NAME,
    skills: Object.fromEntries(skills.map((s) => [s, FORGED_XP])),
  };
  await db.query(
    'insert into game_saves(user_id, slot, snapshot) values ($1,0,$2::jsonb) '
    + 'on conflict (user_id, slot) do update set snapshot = excluded.snapshot, saved_at = now()',
    [FORGER, JSON.stringify(forged)]);
  const savedBack = await one('select snapshot->>\'gold\' g from game_saves where user_id=$1', [FORGER]);
  ok(savedBack && Number(savedBack.g) === FORGED_GOLD,
    'LB-1 (the FIXTURE control): the forged snapshot did not actually land in game_saves, so '
    + 'nothing below is testing a forgery. Check the game_saves insert.');
  await refresh();

  for (const [b, forgedValue] of [
    ['wealth', FORGED_GOLD], ['total_level', FORGED_TOTAL], ['skill:mining', FORGED_XP],
    ['skill:attack', FORGED_XP], ['skill:stonemason', FORGED_XP],
  ]) {
    const got = await scoreOf(b, FORGER);
    ok(got !== forgedValue,
      `LB-1: board "${b}" scored the forger at ${got} — EXACTLY the number written into `
      + 'game_saves.snapshot. The board is still ranking the client-authored blob.');
  }
  // …and specifically, wealth reflects the SERVER balance.
  const srvGold = Number((await one(
    'select gold::text g from player_state where user_id=$1 and slot=0', [FORGER])).g);
  const wealthScore = await scoreOf('wealth', FORGER);
  ok(wealthScore === null ? srvGold === 0 : wealthScore === srvGold,
    `LB-1: the Wealth board says ${wealthScore} but player_state.gold is ${srvGold}. The board `
    + 'must publish the server balance and nothing else.');

  // ── LB-10 — THE IMPERSONATION HALF. ──────────────────────────────────────
  // The old view's name column was
  //   coalesce(p.display_name, gs.snapshot->>'playerName', 'Adventurer')
  // so a player with no profiles row published a name of their choosing to
  // every other player's screen. The fixture drops the profile to reach that
  // exact state — with the display_name fallback intact, this is the one case
  // where the blob's string wins.
  await db.query('delete from profiles where id=$1', [FORGER]);
  await refresh();
  const named = await rowOf('total_level', FORGER);
  ok(!named || named.name !== FORGED_NAME,
    `LB-10: the board published "${FORGED_NAME}" — a display name read straight out of the save `
    + 'blob. A name that crosses to another player must be derived from profiles.');
  ok(!named || named.name === 'Adventurer',
    `LB-10: with no profiles row the name is ${JSON.stringify(named && named.name)}, expected the `
    + 'server-side default "Adventurer".');
  await db.query('insert into profiles(id, display_name) values ($1,$2) '
    + 'on conflict (id) do update set display_name = excluded.display_name', [FORGER, 'Forger']);

  // ── LB-2 — THE POSITIVE. A SERVER-WRITTEN XP GRANT DOES MOVE THE BOARD. ──
  // Without this, a migration that ranked nothing at all would pass LB-1
  // perfectly. This is the assertion that distinguishes a security fix from a
  // leaderboard outage.
  const beforeMining = await scoreOf('skill:mining', HONEST);
  const gr = await apply(HONEST, { xp: { mining: 5000 } });
  ok(gr && gr.ok === true, `LB-2: a legitimate XP grant was refused — ${JSON.stringify(gr)}`);
  await refresh();
  const afterMining = await scoreOf('skill:mining', HONEST);
  ok(afterMining === 5000,
    `LB-2: after a server-written 5000 XP grant the skill:mining board reads ${afterMining} `
    + `(was ${beforeMining}), expected 5000. The board must track player_skills.xp.`);
  const afterTotal = await scoreOf('total_level', HONEST);
  ok(afterTotal > freshTotal,
    `LB-2: total_level did not move (${freshTotal} -> ${afterTotal}) after 5000 mining XP, which `
    + 'is comfortably several levels. total_level must be derived from the stored XP.');

  // ── LB-3 — THE SAME, FOR GOLD. ───────────────────────────────────────────
  const gg = await apply(HONEST, { gold: 5000 });
  ok(gg && gg.ok === true, `LB-3: a legitimate gold grant was refused — ${JSON.stringify(gg)}`);
  await refresh();
  const srvGoldH = Number((await one(
    'select gold::text g from player_state where user_id=$1 and slot=0', [HONEST])).g);
  ok(await scoreOf('wealth', HONEST) === srvGoldH,
    `LB-3: the Wealth board says ${await scoreOf('wealth', HONEST)} and player_state.gold is `
    + `${srvGoldH}. A server-written balance must reach the board.`);
  /* …and the honest player now OUTRANKS the forger, whose blob claims 1e12.
     ⚠ NULL-SAFE, DELIBERATELY. The first version of this dereferenced
       rowOf(...).rank directly, and under mutant M1 (wealth re-joined to
       game_saves) the honest player — who has no game_saves row at all — fell
       out of the board and the harness died with a TypeError. The run still
       exited non-zero, so M1 was reported CAUGHT while every assertion after
       this line had silently never executed. A crash is not a detection; it is
       a detection-shaped hole. The presence check below is the real assertion. */
  const hRow = await rowOf('wealth', HONEST);
  ok(hRow !== null,
    'LB-3: the honest player is ABSENT from the Wealth board despite a server-written balance. '
    + 'The board must rank every player_state row, not only those that happen to have a save blob '
    + '— an inner join to game_saves would drop exactly the players who never wrote one.');
  const fRow = await rowOf('wealth', FORGER);
  ok(hRow === null || fRow === null || Number(hRow.rank) < Number(fRow.rank),
    'LB-3: the forger with 999,999,999,999 blob-gold outranks a player who legitimately earned '
    + '5000. That is the exploit, still live.');

  // ── LB-4 — THE UNSOURCED BOARDS ARE EMPTY, FLAGGED, AND NOT AN ERROR. ────
  const unsourced = (await one('select hr_lb_unsourced() u')).u;
  ok(Array.isArray(unsourced) && unsourced.includes('renown') && unsourced.includes('bosses'),
    `LB-4: hr_lb_unsourced() is ${JSON.stringify(unsourced)} — renown and bosses have no server `
    + 'source and must be declared, not quietly left ranking the blob.');
  for (const b of ['renown', 'bosses']) {
    const rows = await q('select count(*)::text c from leaderboard_ranked where board=$1', [b]);
    ok(Number(rows[0].c) === 0,
      `LB-4: board "${b}" has ${rows[0].c} ranked rows. It has no server source, so any row it `
      + 'holds came from the save blob.');
    const out = await board(HONEST, b);
    ok(out && out.ok === true && out.available === false && out.unavailable === 'no_server_source',
      `LB-4: hr_leaderboard("${b}") returned ${JSON.stringify(out)} — expected ok:true with `
      + 'available:false. An `unknown_board` refusal here would turn the client\'s existing chip '
      + 'into an error screen, which is a worse failure than an empty honour roll.');
    ok(out && Array.isArray(out.top) && out.top.length === 0 && out.rank === null,
      `LB-4: hr_leaderboard("${b}") published ranked rows for a board with no server source.`);
  }

  // ── LB-5 — F5: THE MATVIEW IS NOT CLIENT-READABLE. ───────────────────────
  // The revoke in 2026-08-14-leaderboard-view-lockdown.sql was an ACL on the
  // object this migration DROPS. The replacement inherits the schema default
  // privileges, which on Supabase grant `all on tables` to anon/authenticated —
  // so the hole reopens by default, silently, and nothing else here would see it.
  for (const role of ['anon', 'authenticated']) {
    const g = (await one(
      'select has_table_privilege($1, $2, $3)::text p',
      [role, 'public.leaderboard_ranked', 'select'])).p;
    ok(g === 'false',
      `LB-5: ${role} can SELECT leaderboard_ranked directly. Recreating the matview re-inherited `
      + 'the schema default grant, reopening the F5 dump of every player\'s uuid and name; '
      + 'hr_leaderboard\'s p_limit clamp is no longer the only door.');
  }

  // ── LB-6 — THE PORTED COMBAT-LEVEL FORMULA MATCHES src/core/xp.js. ───────
  // hr_lb_combat_level() is the one piece of client LOGIC this migration
  // duplicates into SQL, and two hand-written copies of one formula is exactly
  // the drift this repo has been burned by. Swept, not spot-checked — and
  // deterministically, so a failure is reproducible.
  let combatLevel, XP_TABLE;
  try {
    ({ combatLevel, XP_TABLE } = await import(
      pathToFileURL(join(ROOT, 'src', 'core', 'xp.js')).href));
  } catch (e) {
    problems.push(`LB-6: could not import src/core/xp.js — ${e.message}`);
  }
  if (combatLevel) {
    const xpFor = (lv) => (lv <= 1 ? 0 : XP_TABLE[lv - 1]);
    const COMBAT = ['attack', 'strength', 'defense', 'hitpoints', 'prayer', 'ranged', 'magic'];
    // Deterministic LCG — Math.random() would make a red irreproducible.
    let seed = 20260818;
    const rnd = (m) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % m; };
    const vectors = [
      [1, 1, 1, 1, 1, 1, 1], [99, 99, 99, 99, 99, 99, 99], [1, 1, 1, 10, 1, 99, 1],
      [1, 1, 1, 10, 1, 1, 99], [99, 99, 1, 1, 1, 1, 1], [1, 1, 99, 99, 99, 1, 1],
      [50, 50, 50, 50, 51, 50, 50], [98, 98, 98, 98, 97, 98, 98], [1, 99, 1, 99, 1, 99, 1],
    ];
    for (let i = 0; i < 300; i++) vectors.push(COMBAT.map(() => 1 + rnd(99)));

    let mismatches = 0, firstBad = null;
    for (const v of vectors) {
      const js = combatLevel(Object.fromEntries(COMBAT.map((k, i) => [k, xpFor(v[i])])));
      const sql = Number((await one(
        'select hr_lb_combat_level($1,$2,$3,$4,$5,$6,$7)::text c',
        [v[0], v[1], v[2], v[3], v[4], v[5], v[6]])).c);
      if (js !== sql) { mismatches++; if (!firstBad) firstBad = { v, js, sql }; }
    }
    ok(mismatches === 0,
      `LB-6: hr_lb_combat_level() disagrees with src/core/xp.js combatLevel() on ${mismatches} of `
      + `${vectors.length} vectors. First: levels ${JSON.stringify(firstBad && firstBad.v)} -> `
      + `JS ${firstBad && firstBad.js}, SQL ${firstBad && firstBad.sql}. The board would show a `
      + 'different combat level from the player\'s own screen. NOTE the float8 casts in the SQL '
      + 'are load-bearing: numeric (exact-decimal) arithmetic on 0.325 differs from IEEE754 '
      + 'double in the last bits, and the result is immediately floored.');
  }

  // ── LB-7 — THE READ SHAPE THE CLIENT PARSES IS UNCHANGED. ───────────────
  // src/features/leaderboards.js reduceBoard() consumes ok/board/refreshed_at/
  // total/top/rank/near, and normRow() consumes rank/id/name/clan/score/
  // saved_at. `available` is ADDITIVE — reduceBoard ignores unknown keys — and
  // this asserts the additive key did not displace anything.
  const shape = await board(HONEST, 'skill:mining');
  for (const k of ['ok', 'board', 'refreshed_at', 'total', 'top', 'rank', 'near']) {
    ok(Object.prototype.hasOwnProperty.call(shape || {}, k),
      `LB-7: hr_leaderboard's response has no "${k}" key — src/features/leaderboards.js `
      + `reduceBoard() reads it, and its absence would render as an empty or failed board.`);
  }
  ok(shape && shape.available === true,
    'LB-7: a SOURCED board must report available:true, or the client cannot tell the two cases '
    + 'apart once it starts reading the flag.');
  const meRow = (shape.top || []).find((r) => r.id === HONEST);
  ok(meRow, 'LB-7: the honest player is absent from the skill:mining top — LB-2 said the score '
    + 'landed, so the reader and the view disagree.');
  if (meRow) {
    for (const k of ['rank', 'id', 'name', 'clan', 'score', 'saved_at']) {
      ok(Object.prototype.hasOwnProperty.call(meRow, k),
        `LB-7: a board row has no "${k}" key — normRow() in the client reads it.`);
    }
    ok(meRow.name === 'Honest',
      `LB-7: the row name is ${JSON.stringify(meRow.name)}, expected the profiles display_name.`);
    ok(meRow.saved_at != null,
      'LB-7: saved_at is null — it now comes from player_state.updated_at (a server clock) and '
      + 'the client stamps "updated Nm ago" from it.');
  }
  ok(shape && shape.rank != null,
    'LB-7: the self block has no rank. "Where am I?" is the entire retention hook of the '
    + 'leaderboard and it must survive the rebuild.');

  /* ── LB-11 — THE A9 RATE GATE SURVIVED THE REBUILD (the one-way door). ────
     THE DEFECT THIS FILE'S FIRST REVISION ACTUALLY SHIPPED, so it is asserted
     here rather than trusted. 2026-08-11-authenticated-surface-lockdown.sql §4
     A9-retrofitted hr_leaderboard: the original body was renamed to
     hr_leaderboard__ungated and a thin hr_rpc_gate wrapper took the public
     name. A `create or replace function public.hr_leaderboard(...)` therefore
     does not update the reader — it DELETES THE WRAPPER, leaving an ungated,
     anon-callable RPC. The migration now replaces the __ungated twin.
     Everything else in this file calls the public name and passed happily
     either way; the failure surfaced two guards away, as
     hr_assert_grant_hygiene's `ungated_client_rpcs`. */
  const srcOf = async (name) => {
    const r = await q('select prosrc s from pg_proc p join pg_namespace n on n.oid=p.pronamespace '
      + 'where n.nspname=$1 and p.proname=$2', ['public', name]);
    return r.length ? r[0].s : null;
  };
  const wrapperSrc = await srcOf('hr_leaderboard');
  const twinSrc = await srcOf('hr_leaderboard__ungated');
  ok(twinSrc !== null,
    'LB-11: public.hr_leaderboard__ungated does not exist. The migration replaced the PUBLIC name, '
    + 'which is the A9 wrapper — so the rate gate has been deleted and the board RPC is now '
    + 'ungated and anon-callable.');
  ok(wrapperSrc !== null && wrapperSrc.includes('hr_rpc_gate'),
    'LB-11: public.hr_leaderboard no longer calls hr_rpc_gate. The A9 wrapper was overwritten by a '
    + 'create-or-replace on the public name (the one-way door); replace hr_leaderboard__ungated '
    + 'instead.');
  ok(twinSrc === null || !twinSrc.includes('hr_rpc_gate'),
    'LB-11 (the POSITIVE control): the __ungated twin references hr_rpc_gate, so the scan above '
    + 'cannot tell the wrapper from the body and LB-11 could not fail honestly.');
  ok(twinSrc === null || twinSrc.includes('leaderboard_ranked'),
    'LB-11: hr_leaderboard__ungated does not read leaderboard_ranked — the new reader body went '
    + 'somewhere else and the gate now fronts a stale one.');
  for (const role of ['anon', 'authenticated']) {
    const g = (await one('select has_function_privilege($1,$2,$3)::text p',
      [role, 'public.hr_leaderboard__ungated(text,int,int)', 'execute'])).p;
    ok(g === 'false',
      `LB-11: ${role} can execute hr_leaderboard__ungated directly, which makes the rate gate `
      + 'optional — a caller simply names the twin.');
  }

  // ── LB-8 — §0's PREDECESSOR ANCHOR MUST DISCRIMINATE (the SKILL-8 lesson). ─
  // THE ONLY ASSERTION HERE THAT DOES NOT NEED A DATABASE. §0 gates on
  // hr_lb_skills() containing 'stonemason'. That term must be ABSENT from the
  // predecessor-of-the-predecessor and PRESENT in the predecessor — a positive
  // and a negative control, which is the only shape of this check that can fail
  // honestly. Anchoring on a term BOTH files contain is the mistake that has
  // been made three times on the hr_apply chain.
  const readMig = async (f) => (await readFile(
    join(ROOT, 'supabase', 'migrations', f), 'utf8')).replace(/\r\n/g, '\n');
  const skillsFn = (sql) => {
    const i = sql.indexOf('create or replace function public.hr_lb_skills()');
    return i < 0 ? '' : sql.slice(i, sql.indexOf('$$;', i));
  };
  const oldBody = skillsFn(await readMig('2026-08-08-leaderboards.sql'));
  const newBody = skillsFn(await readMig('2026-08-17-leaderboard-skills.sql'));
  ok(oldBody.length > 100 && newBody.length > 100,
    'LB-8: could not extract one of the two hr_lb_skills() bodies — the control is not a control.');
  ok(!oldBody.includes('stonemason'),
    'LB-8 (the NEGATIVE control): "stonemason" is present in 2026-08-08-leaderboards.sql\'s '
    + 'hr_lb_skills(), so it does NOT discriminate and §0 would install onto a database that '
    + 'never received 2026-08-17-leaderboard-skills.sql — silently dropping two boards from a '
    + 'view that had just been rebuilt and looked correct. Pick an anchor unique to the predecessor.');
  ok(newBody.includes('stonemason') && newBody.includes('runecrafting'),
    'LB-8 (the POSITIVE control): "stonemason" is absent from 2026-08-17-leaderboard-skills.sql\'s '
    + 'hr_lb_skills(), so §0 would refuse to install onto the very database it was written for.');
  const mine = await readMig('2026-08-18-leaderboard-server-source.sql');
  const s0 = mine.slice(0, mine.indexOf('-- ── 1. Combat level'));
  ok(s0.includes("'stonemason' = any (v_skills)"),
    'LB-8: §0 no longer gates on the stonemason term — the predecessor gate cannot refuse a '
    + 'database that is still on the fifteen-skill namespace.');

  guard.report = [
    `LB: forged snapshot (gold ${FORGED_GOLD}, xp ${FORGED_XP}, name "${FORGED_NAME}") moved no `
    + `board; a server-written 5000 xp / 5000 gold moved skill:mining, total_level and wealth.`,
    `LB: ${skills.length} skill boards + total_level/combat_level/wealth/clan_power sourced from `
    + 'player_state + player_skills; renown + bosses declared unsourced and rank nobody.',
  ];
  return problems;
}

/* ── MUTANTS ─────────────────────────────────────────────────────────────
   All edit the migration, which is the body that actually runs.

   ⚠ EACH MUTANT THAT WOULD TRIP THE MIGRATION'S OWN §6 CARRIES `BLIND`, AND
     WITHOUT IT THIS HARNESS WOULD BE A FRAUD. If §6 raises, the file fails to
     apply, bootReplay throws, and EVERY mutant reports CAUGHT — including ones
     that no behavioural assertion here would have noticed. That is the
     always-null-probe family wearing a green tick. So §6 is short-circuited and
     the fault is left to reach BEHAVIOUR. §6 is graded separately, by the
     migration replaying at all in every other run of this file.

   ⚠⚠ DO NOT RUN `--mutate` CONCURRENTLY WITH THE SMOKE SUITE OR ANOTHER
     MUTATION HARNESS. It edits a real migration in place and restores it
     afterwards; a suite running beside it reads the MUTATED bytes. */
const MIG = 'supabase/migrations/2026-08-18-leaderboard-server-source.sql';
/* `return` in a DO block ends it, so §6 stops before its first assertion. */
const BLIND2 = [["  if to_regclass('public.leaderboard_ranked') is null then\n"
  + "    raise exception 'leaderboard_ranked missing';\n  end if;",
'  return; -- MUTATION HARNESS: §6 disabled so the BEHAVIOUR is what fails']];

const MUTANTS = [
  {
    id: 'M1', file: MIG,
    what: 'the wealth board reverts to the save blob, so forged gold buys rank #1 again',
    edits: [["  select 'wealth', b.user_id, b.name, b.clan_name, b.gold, b.saved_at\n  from base b",
      "  select 'wealth', b.user_id, b.name, b.clan_name,\n"
      + "         public.hr_lb_num(gs.snapshot, 'gold'), b.saved_at\n"
      + '  from base b join public.game_saves gs on gs.user_id = b.user_id and gs.slot = 0'],
    ...BLIND2],
  },
  {
    id: 'M2', file: MIG,
    what: 'the F5 revoke is dropped, so the recreated matview re-inherits the schema default '
      + 'grant and anon can dump every player again',
    edits: [['revoke all on public.leaderboard_ranked from public, anon, authenticated, service_role;',
      '-- revoke removed by the mutation harness'], ...BLIND2],
  },
  {
    id: 'M3', file: MIG,
    what: 'renown goes back to ranking snapshot->>\'renown\' (a board still sourced from the blob '
      + 'while the rebuild claims to be done)',
    edits: [["  -- NOTE: no 'renown' branch and no 'bosses' branch.",
      "  union all\n  select 'renown', b.user_id, b.name, b.clan_name,\n"
      + "         public.hr_lb_num(gs.snapshot, 'renown'), b.saved_at\n"
      + '  from base b join public.game_saves gs on gs.user_id = b.user_id and gs.slot = 0\n'
      + "  -- NOTE: no 'renown' branch and no 'bosses' branch."], ...BLIND2],
  },
  {
    id: 'M4', file: MIG,
    what: 'the display-name fallback to snapshot->>\'playerName\' comes back (impersonation)',
    edits: [["         coalesce(p.display_name, 'Adventurer')     as name,",
      "         coalesce(p.display_name, gs2.snapshot->>'playerName', 'Adventurer') as name,"],
    ['  left join public.clans    c on c.id = p.clan_id\n  where ps.slot = 0',
      '  left join public.clans    c on c.id = p.clan_id\n'
      + '  left join public.game_saves gs2 on gs2.user_id = ps.user_id and gs2.slot = 0\n'
      + '  where ps.slot = 0'], ...BLIND2],
  },
  /* ⚠ THERE IS DELIBERATELY NO "numeric INSTEAD OF float8" MUTANT.
     One was written, and it SLIPPED — correctly. The expression reduces to
     floor(B*0.25 + X*0.325) with B an integer in [2,247] and X an integer in
     [2,198]; double arithmetic agrees with exact rational arithmetic
     ((10B+13X)/40) on all 49,551 reachable pairs. The two forms are
     behaviourally identical everywhere a player can stand, so the mutant could
     never be caught by anything, and leaving it in the list would permanently
     display a SLIPPED that looks like a hole in this guard and is not one. The
     migration's comment on those casts was corrected to match this measurement
     rather than keeping the plausible-sounding claim it started with. */
  {
    id: 'M6', file: MIG,
    what: 'the missing-skill coalesce defaults to 0 instead of 1, so a fresh character\'s combat '
      + 'level disagrees with their own screen',
    edits: [["           coalesce(max(l.level) filter (where l.skill_id = 'attack'),    1),",
      "           coalesce(max(l.level) filter (where l.skill_id = 'attack'),    0),"], ...BLIND2],
  },
  {
    /* THE DEFECT THIS FILE'S FIRST REVISION ACTUALLY SHIPPED. §4 replaced the
       PUBLIC hr_leaderboard rather than the __ungated twin, which overwrote the
       A9 rate-gate wrapper from 2026-08-11-authenticated-surface-lockdown.sql.
       Nothing in this guard noticed; it surfaced as
       `ungated_client_rpcs: ["hr_leaderboard(text,integer,integer)"]` from
       hr_assert_grant_hygiene, two unrelated smoke guards away. Now it is
       caught here, next to the change that causes it. */
    id: 'M8', file: MIG,
    what: 'the reader replaces the PUBLIC hr_leaderboard instead of the __ungated twin, deleting '
      + 'the A9 rate-gate wrapper and leaving an ungated anon-callable RPC (the one-way door)',
    edits: [['create or replace function public.hr_leaderboard__ungated(',
      'create or replace function public.hr_leaderboard('],
    ['revoke all on function public.hr_leaderboard__ungated(text, int, int)\n'
      + '  from public, anon, authenticated, service_role;',
    'revoke all on function public.hr_leaderboard(text, int, int) from public;\n'
      + 'grant execute on function public.hr_leaderboard(text, int, int) to anon, authenticated;'],
    ...BLIND2],
  },
  {
    /* ⚠ NO BLIND. §6 does not check §0, and LB-8 is a source read rather than a
       database assertion — blinding §6 here would prove nothing. */
    id: 'M7', file: MIG,
    what: "§0's predecessor gate reverts to a term the 2026-08-08 body also contains, so it would "
      + 'install onto a database still on the fifteen-skill namespace (the SKILL-8 class)',
    edits: [["  if not ('stonemason' = any (v_skills)) or not ('runecrafting' = any (v_skills)) then",
      "  if not ('bountyHunter' = any (v_skills)) then"]],
  },
];

async function mutate() {
  const { writeFile } = await import('node:fs/promises');
  const { spawnSync } = await import('node:child_process');
  const { snapshot, assertNoResidue, noteDirtyTree } = await import('./mutation-safety.mjs');
  let bad = 0;
  assertNoResidue(MUTANTS.flatMap((m) => m.edits.map(([from, to]) => (
    { file: join(ROOT, m.file), from, to }))));
  noteDirtyTree([...new Set(MUTANTS.map((m) => m.file))], { cwd: ROOT });
  for (const m of MUTANTS) {
    const path = join(ROOT, m.file);
    const original = snapshot(path);
    let mutated = original;
    let planted = true;
    for (const [from, to] of m.edits) {
      const hits = mutated.split(from).length - 1;
      if (hits !== 1) {
        console.log(`  ! ${m.id}: anchor matched ${hits} times, must match 1 — the mutant is not `
          + `being planted, so its "caught" verdict would be meaningless. Anchor: `
          + `${JSON.stringify(from.slice(0, 60))}`);
        planted = false; break;
      }
      mutated = mutated.replace(from, to);
    }
    if (!planted) { bad++; continue; }
    await writeFile(path, mutated, 'utf8');
    let out;
    try {
      out = spawnSync(process.execPath, [join(ROOT, 'tests', 'leaderboard-server-source.mjs')],
        { encoding: 'utf8', timeout: 900000 });
    } finally {
      await writeFile(path, original, 'utf8');
    }
    if (out.status !== 0) {
      const c = (out.stdout || '').split('\n').filter((l) => l.startsWith('  x ')).length;
      console.log(`  ✓ ${m.id} CAUGHT (${c || '?'}) — ${m.what}`);
    } else { console.log(`  ✗ ${m.id} SLIPPED — ${m.what}`); bad++; }
  }
  return bad;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  if (process.argv.includes('--mutate')) {
    console.log('leaderboard server source — mutation harness:');
    const bad = await mutate();
    (await import('./mutation-safety.mjs')).finish(bad ? 1 : 0);
  }
  const found = await guard();
  if (found.length) {
    console.log('leaderboard server source — FAILED:');
    for (const p of found) console.log('  x ' + p);
    process.exit(1);
  }
  console.log('leaderboard server source — a forged snapshot buys no rank.');
  for (const line of guard.report || []) console.log(`  ${line}`);
}
