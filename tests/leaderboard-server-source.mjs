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
import { isMain } from './_is-main.mjs';

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
  /** One HERO's row on one board, straight off the matview (2027-02-12-leaderboard-heroes.sql:
      one row per hero, keyed board + user_id + slot). */
  const rowOf = async (board, uid, slot = 0) => (await q(
    'select score::text score, rank::text rank, place::text place, level, name from leaderboard_ranked '
    + 'where board=$1 and user_id=$2 and slot=$3', [board, uid, slot]))[0] || null;
  const scoreOf = async (board, uid, slot = 0) => {
    const r = await rowOf(board, uid, slot);
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
  /* 15 since the core rebuild: Melee replaces Attack + Strength, Hitpoints is gone (2026-10-27-core-bodies.sql). */
  ok(Array.isArray(skills) && skills.includes('stonemason') && skills.includes('melee') && skills.length === 15,
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
  //   ACTUALLY EXIST, not hardcoded: each skill on its OWN curve (the combat skills
  //   uncapped, the rest capped at 99), the same sum hr_skill_level makes in the view.
  await refresh();
  const xp = await import(pathToFileURL(join(ROOT, 'src', 'core', 'xp.js')).href);
  const rowsOf = async () => Object.fromEntries((await q(
    'select skill_id, xp::text xp from player_skills where user_id=$1 and slot=0', [HONEST]))
    .map((r) => [r.skill_id, Number(r.xp)]));
  const skillXp = await rowsOf();
  ok(Object.keys(skillXp).length > 0,
    'LB-9 (the FIXTURE control): hr_create_character seeded no player_skills rows, so the '
    + 'bootstrap expectations below are computed from nothing.');
  const wantTotal = xp.totalLevel(skillXp);
  const freshTotal = await scoreOf('total_level', HONEST);
  ok(freshTotal === wantTotal,
    `LB-9: a freshly bootstrapped character scores ${freshTotal} on total_level; src/core/xp.js `
    + `totalLevel() over the SAME seeded rows says ${wantTotal}. null means the player fell out of `
    + 'the view entirely; a mismatch means the server and the client disagree about the player\'s own level.');
  ok(freshTotal != null, 'LB-9: a bootstrapped character with no activity must still RANK on total_level.');
  /* THE LEVEL BOARD (core rebuild): the score is Level XP, from kills only; a character that has
     killed nothing (0) ranks nobody, exactly as every board drops a zero score. */
  ok(await scoreOf('level', HONEST) === null, 'LB-9: a character with 0 Level XP ranks on the Level board');

  /* ── LB-9b — A COMBAT SKILL COUNTS ON ITS OWN CURVE. ──
     Melee is raised to level 30 on the combat curve (300,743 XP): the capped 99 table reads that XP
     as level 60, so a view that summed hr_level_from_xp would disagree with the player's own screen
     by 30 levels. A
     missing row (Mining deleted) must simply not count — the view sums the rows that exist. */
  const meleeGrant = await apply(HONEST, { xp: { melee: xp.skillXpForLevel('melee', 30) } });
  ok(meleeGrant && meleeGrant.ok === true, `LB-9b: the Melee grant was refused — ${JSON.stringify(meleeGrant)}`);
  const del = await db.query(
    'delete from player_skills where user_id=$1 and slot=0 and skill_id=$2', [HONEST, 'mining']);
  ok(del.affectedRows === 1,
    `LB-9b (the FIXTURE control): the delete removed ${del.affectedRows} rows, expected 1.`);
  await refresh();
  const partial = await rowsOf();
  ok(xp.skillLevelFromXp('melee', partial.melee || 0) === 30, 'LB-9b (the FIXTURE control): Melee is not at level 30');
  ok(await scoreOf('total_level', HONEST) === xp.totalLevel(partial),
    `LB-9b: total_level is ${await scoreOf('total_level', HONEST)}; src/core/xp.js totalLevel() over the `
    + `remaining rows says ${xp.totalLevel(partial)} — a combat skill must count on its own curve.`);

  // ── LB-1 — THE FORGERY. A hand-written save blob moves NOTHING. ──────────
  // This is the exploit, executed. The insert is what the live client does on
  // autosave, and RLS permits it (game_saves is the player's own row) — so this
  // is not a privilege the fix removes, it is a privilege the fix makes useless.
  const forged = {
    gold: FORGED_GOLD,
    totalLevel: FORGED_TOTAL,
    combatLevel: 126,
    level: 999,
    levelXp: FORGED_XP,
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
    ['total_level', FORGED_TOTAL], ['skill:mining', FORGED_XP],
    ['skill:melee', FORGED_XP], ['skill:stonemason', FORGED_XP], ['level', FORGED_XP],
  ]) {
    const got = await scoreOf(b, FORGER);
    ok(got !== forgedValue,
      `LB-1: board "${b}" scored the forger at ${got} — EXACTLY the number written into `
      + 'game_saves.snapshot. The board is still ranking the client-authored blob.');
  }
  /* …and forged gold reaches no board at all: Wealth is CUT (2027-02-12-leaderboard-heroes.sql §2 — the
     purse is the ACCOUNT's, 2026-12-15-account-gold.sql, so a board of heroes cannot say who holds it). */
  const goldRows = Number((await one(
    'select count(*)::text c from leaderboard_ranked where score = $1', [FORGED_GOLD])).c);
  ok(goldRows === 0, `LB-1: ${goldRows} ranked rows score exactly the forged gold ${FORGED_GOLD}.`);

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

  // ── LB-3 — GOLD RANKS NOWHERE: WEALTH AND CLAN POWER ARE CUT. ───────────
  /* A legitimate, server-written gold grant (the POSITIVE control: it must land in the purse) moves no board,
     and the cut boards answer `unknown_board` rather than an empty roll that implies someone could top it. */
  const gg = await apply(HONEST, { gold: 5000 });
  ok(gg && gg.ok === true, `LB-3: a legitimate gold grant was refused — ${JSON.stringify(gg)}`);
  const srvGoldH = Number((await one(
    'select coalesce((select w.gold from account_wallet w where w.user_id=$1), 0)::text g', [HONEST])).g);
  ok(srvGoldH >= 5000, `LB-3 (the FIXTURE control): the account purse is ${srvGoldH} after a 5000 grant.`);
  await refresh();
  const purseRows = Number((await one(
    "select count(*)::text c from leaderboard_ranked where board in ('wealth','clan_power')")).c);
  ok(purseRows === 0, `LB-3: ${purseRows} rows rank on the cut wealth / clan_power boards.`);
  for (const b of ['wealth', 'clan_power']) {
    const out = await board(HONEST, b);
    ok(out && out.ok === false && out.error === 'unknown_board',
      `LB-3: hr_leaderboard("${b}") answered ${JSON.stringify(out)} — a cut board must be unknown_board.`);
  }

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
    ok(out && Array.isArray(out.top) && out.top.length === 0 && Array.isArray(out.mine) && out.mine.length === 0,
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

  // ── LB-6 — THE LEVEL BOARD IS THE SERVER'S LEVEL XP. ─────────────────────
  // (Was the ported combat-level formula; the combat level is deleted with the core rebuild.)
  // A server-written Level XP (the hunt settle is its only writer; the fixture writes the column
  // directly, as the settle would) moves the board to exactly that number.
  await db.query('update player_state set level_xp = 21591 where user_id = $1 and slot = 0', [HONEST]);
  await refresh();
  ok(await scoreOf('level', HONEST) === 21591,
    `LB-6: the Level board reads ${await scoreOf('level', HONEST)} after player_state.level_xp = 21591 — it must rank the server's Level XP.`);
  ok(await scoreOf('level', FORGER) !== FORGED_XP, 'LB-6: the Level board ranked the forger\'s blob');

  // ── LB-7 — THE READ SHAPE THE CLIENT PARSES. ─────────────────────────────
  // src/session/honor-roll.js readBoard() consumes ok/board/available/refreshed_at/total/top/mine, and each
  // row's rank/place/name/level/score (+ mine/slot on the caller's own heroes, + near on a mine entry).
  // NOTHING ELSE CROSSES: no account uuid, no clan, no timestamp per row (2027-02-12-leaderboard-heroes.sql §5).
  const shape = await board(HONEST, 'skill:mining');
  for (const k of ['ok', 'board', 'available', 'refreshed_at', 'total', 'top', 'mine']) {
    ok(Object.prototype.hasOwnProperty.call(shape || {}, k),
      `LB-7: hr_leaderboard's response has no "${k}" key — the Roll of Honor reads it.`);
  }
  ok(shape && shape.available === true,
    'LB-7: a SOURCED board must report available:true, or the client cannot tell the two cases apart.');
  ok(shape && shape.refreshed_at != null, 'LB-7: the answer has no refreshed_at — the window cannot say how fresh it is.');
  const ROW_KEYS = ['rank', 'place', 'name', 'level', 'score'];
  const meRow = (shape.top || []).find((r) => r.mine === true && r.slot === 0);
  ok(meRow, 'LB-7: the honest hero is absent (or unmarked) in the skill:mining top — LB-2 said the score '
    + 'landed, so the reader and the view disagree, or the caller\'s own row lost its mark.');
  if (meRow) {
    for (const k of ROW_KEYS) {
      ok(Object.prototype.hasOwnProperty.call(meRow, k), `LB-7: a board row has no "${k}" key — the window reads it.`);
    }
    ok(meRow.name === 'Honest',
      `LB-7: the row name is ${JSON.stringify(meRow.name)}, expected "Honest" (no character_names row: the `
      + 'account name stands in for slot 0, hr_character_name).');
    ok(meRow.level === xp.skillLevelFromXp('mining', meRow.score),
      `LB-7: the row says level ${meRow.level} for ${meRow.score} Mining XP; src/core/xp.js says `
      + `${xp.skillLevelFromXp('mining', meRow.score)}. The level a player reads must be the server's own.`);
  }
  const ALLOWED = new Set([...ROW_KEYS, 'mine', 'slot']);
  for (const r of shape.top || []) {
    const extra = Object.keys(r).filter((k) => !ALLOWED.has(k));
    ok(extra.length === 0, `LB-7: a top row carries ${extra.join(', ')} — only ${[...ALLOWED].join(', ')} may cross.`);
    ok(r.mine === true || (!('slot' in r) && !('mine' in r)),
      'LB-7: another player\'s row carries a slot or a mine mark.');
  }
  ok(Array.isArray(shape.mine) && shape.mine.length >= 1 && shape.mine.every((m) => m.mine === true
      && Number.isInteger(m.slot) && Array.isArray(m.near) && m.near.some((n) => n.rank === m.rank)),
    `LB-7: mine is ${JSON.stringify(shape.mine)} — "where am I?" must list the caller's ranked heroes, each `
    + 'with its neighbours (itself included).');
  const forgerView = await board(FORGER, 'skill:mining');
  ok(forgerView && Array.isArray(forgerView.top)
      && !forgerView.top.some((r) => r.name === 'Honest' && ('slot' in r || 'mine' in r)),
    'LB-7: the honest hero is marked as the FORGER\'s own — the mark must follow auth.uid().');

  /* ── LB-13 — EVERY HERO RANKS, BY ITS OWN NAME (2027-02-12-leaderboard-heroes.sql §3). ─────────────
     The defect: the view was slot 0 of each ACCOUNT under profiles.display_name, so a second hero never
     ranked and every row read "Adventurer". The second hero gets a character name and the strongest Mining
     XP; it must rank FIRST among the fixture, by that name, while the first hero keeps its own row. */
  const second = (await db.query("select set_config('request.jwt.claim.sub',$1,false)", [HONEST]),
    (await db.query('select hr_create_character(1) r')).rows[0].r);
  ok(second && second.ok === true, `LB-13 (the FIXTURE control): a second hero could not be made — ${JSON.stringify(second)}`);
  await db.query('insert into character_names (user_id, slot, name, canonical) values ($1, 1, $2, hr_canon_display_name($2)) '
    + 'on conflict (user_id, slot) do update set name = excluded.name, canonical = excluded.canonical', [HONEST, 'Wennetyr']);
  await db.query("update player_skills set xp = 987654 where user_id = $1 and slot = 1 and skill_id = 'mining'", [HONEST]);
  await db.query('update player_state set level_xp = 77777 where user_id = $1 and slot = 1', [HONEST]);
  await refresh();
  const s1 = await rowOf('skill:mining', HONEST, 1);
  ok(s1 && Number(s1.score) === 987654 && s1.name === 'Wennetyr',
    `LB-13: the second hero's Mining row is ${JSON.stringify(s1)} — expected 987654 XP under "Wennetyr". `
    + 'A board of ACCOUNTS (slot 0) or of account names is back.');
  ok(await scoreOf('level', HONEST, 1) === 77777, 'LB-13: the second hero is not on the Level board.');
  ok(await rowOf('total_level', HONEST, 0) !== null && await rowOf('total_level', HONEST, 1) !== null,
    'LB-13: one account\'s two heroes are not two Total level rows.');
  const two = await board(HONEST, 'skill:mining');
  ok(two && two.mine.length === 2 && two.mine.map((m) => m.slot).join() === '0,1'
      && two.mine[1].name === 'Wennetyr' && two.mine[1].score === 987654,
    `LB-13: mine is ${JSON.stringify(two && two.mine)} — both of the caller's heroes must be listed, by slot.`);

  /* ── LB-14 — A HIDDEN ACCOUNT OR HERO HOLDS NO PLACE (hr_lb_hidden). ── */
  await db.query("insert into hr_lb_hidden (user_id, slot, reason, note) values ($1, null, 'test', 'LB-14')", [FORGER]);
  await db.query("insert into hr_lb_hidden (user_id, slot, reason, note) values ($1, 1, 'name', 'LB-14')", [HONEST]);
  await refresh();
  const hiddenRows = Number((await one(
    'select count(*)::text c from leaderboard_ranked where user_id = $1 or (user_id = $2 and slot = 1)', [FORGER, HONEST])).c);
  ok(hiddenRows === 0, `LB-14: ${hiddenRows} rows still rank a hidden account or hero.`);
  ok(await rowOf('total_level', HONEST, 0) !== null,
    'LB-14 (the CONTROL): hiding one hero took its account\'s other hero off the board.');
  for (const role of ['anon', 'authenticated']) {
    const g = (await one('select has_table_privilege($1, $2, $3)::text p', [role, 'public.hr_lb_hidden', 'select'])).p;
    ok(g === 'false', `LB-14: ${role} can read hr_lb_hidden — who was hidden, and why, is the server's.`);
  }
  await db.query("delete from hr_lb_hidden where note = 'LB-14'");

  /* ── LB-15 — A NAME THE BLOCKLIST REFUSES NEVER LEAVES THE SERVER. ──
     Written past the creation check, as a blocklist that grew after the hero was named would leave it. */
  const stem = (await one("select stem from hr_name_blocklist where match = 'substring' and length(stem) between 3 and 12 "
    + 'order by length(stem), stem limit 1')).stem;
  const bad = stem.charAt(0).toUpperCase() + stem.slice(1) + 'qz';
  ok((await one('select hr_name_blocked($1)::text b', [bad])).b === 'true', 'LB-15 (the FIXTURE control): the probe name is not blocked.');
  await db.query('update character_names set name = $2, canonical = hr_canon_display_name($2) where user_id = $1 and slot = 1', [HONEST, bad]);
  await refresh();
  const masked = await board(FORGER, 'skill:mining');
  ok(masked && !JSON.stringify(masked).includes(bad) && masked.top.some((r) => r.name === 'Name hidden' && r.score === 987654),
    'LB-15: a blocked hero name reached another player\'s answer (or its row vanished instead of being masked).');
  await db.query('update character_names set name = $2, canonical = hr_canon_display_name($2) where user_id = $1 and slot = 1', [HONEST, 'Wennetyr']);
  await refresh();

  /* ── LB-16 — TIES SHARE A PLACE; THE STRICT RANK STILL ORDERS THEM. ── */
  await db.query("update player_skills set xp = 4243 where (user_id, slot) in (($1::uuid, 0), ($2::uuid, 0)) and skill_id = 'fishing'", [HONEST, FORGER]);
  await refresh();
  const fa = await rowOf('skill:fishing', HONEST, 0), fb = await rowOf('skill:fishing', FORGER, 0);
  ok(fa && fb && fa.place === fb.place && fa.rank !== fb.rank,
    `LB-16: tied heroes read ${JSON.stringify(fa)} / ${JSON.stringify(fb)} — equal scores share a place.`);

  /* ── LB-12 — STEADY-STATE REFRESH WRITES NOTHING (the WAL churn). ────────
     Reliability measured hr_leaderboard_refresh doing ~11,188 inserts + 11,175
     deletes over 34h on a ~107-row board — every one of those rows decoded by
     Realtime's walrus and thrown away, on an instance starved enough to be
     dropping player save writes.

     The instinct is to hand-roll upsert-and-prune. Measured instead, and that
     would have been WRONG WORK: `refresh materialized view concurrently`
     ALREADY diffs (0 of 32 rows rewritten when nothing changed; a plain
     refresh rewrites all 32). The residual churn came from the ROW CONTENT —
     saved_at was player_state.updated_at, which moves on every ~90s settle, so
     every active player's rows changed every refresh and the diff had nothing
     to save. 11,188/408 refreshes ≈ 27 rows each ≈ the active quarter of the
     board, which is the signature of a working diff over volatile content, not
     of a full rebuild (that would be 408 × 107 ≈ 43,656).

     So this asserts the property, not the mechanism: after a settle that
     changes no score, a concurrent refresh must rewrite ZERO rows — and,
     paired with it so a matview that never updates at all cannot pass, a real
     score change MUST still rewrite. Measured physically via tuple xmin
     (pg_stat_user_tables reports 0/0/0 in PGlite even for a full rebuild, so
     the stats collector is an always-null probe here). */
  const xminMap = async () => new Map((await q(
    'select board, user_id::text sid, slot, xmin::text::bigint x from leaderboard_ranked'))
    .map((r) => [`${r.board}|${r.sid}|${r.slot}`, Number(r.x)]));
  const churn = async (fn) => {
    const before = await xminMap();
    await fn();
    const after = await xminMap();
    let rewritten = 0, added = 0, removed = 0;
    for (const [k, x] of after) {
      if (!before.has(k)) added++; else if (before.get(k) !== x) rewritten++;
    }
    for (const k of before.keys()) if (!after.has(k)) removed++;
    return { rewritten, added, removed, rows: after.size };
  };
  const conc = () => db.exec('refresh materialized view concurrently leaderboard_ranked');

  await conc();
  const idle = await churn(conc);
  ok(idle.rows > 0,
    'LB-12 (the FIXTURE control): the matview is EMPTY, so a zero-churn result below would be '
    + 'vacuously true. Nothing is being measured.');
  ok(idle.rewritten === 0 && idle.added === 0 && idle.removed === 0,
    `LB-12: a concurrent refresh with NOTHING changed rewrote ${idle.rewritten} of ${idle.rows} `
    + 'rows. `refresh ... concurrently` diffs, so a non-zero result means a ranked row carries '
    + 'content that moves on its own — almost certainly a timestamp.');

  // A SETTLE that changes no score. This is the case that was churning.
  await db.query('update player_state set updated_at = now()');
  const settled = await churn(conc);
  ok(settled.rewritten === 0 && settled.added === 0 && settled.removed === 0,
    `LB-12: after every player settled (player_state.updated_at moved, no score changed) a `
    + `concurrent refresh rewrote ${settled.rewritten} of ${settled.rows} rows — it must rewrite `
    + 'ZERO. A per-settle timestamp in a ranked row makes every active player churn on every '
    + 'refresh and defeats the diff entirely; that WAL is decoded by Realtime and discarded. '
    + 'Source saved_at as null (or a coarse bucket), not as player_state.updated_at.');

  /* THE PAIRED POSITIVE. Without this, a matview that silently stopped
     updating — or one whose refresh is a no-op — would satisfy every zero
     above perfectly. Zero churn is only a virtue if real changes still land. */
  const beforeScore = await scoreOf('skill:mining', HONEST);
  const bump = await apply(HONEST, { xp: { mining: 4000 } });
  ok(bump && bump.ok === true, `LB-12: the xp grant was refused — ${JSON.stringify(bump)}`);
  const moved = await churn(conc);
  ok(moved.rewritten + moved.added > 0,
    'LB-12 (the PAIRED POSITIVE): a real XP gain caused NO row to be rewritten. The refresh is a '
    + 'no-op and every zero-churn assertion above is meaningless.');
  ok(await scoreOf('skill:mining', HONEST) === beforeScore + 4000,
    'LB-12: the concurrent refresh did not publish the new score.');

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
     hr_assert_grant_hygiene's `ungated_client_rpcs`.

     ⚠ THIS IS THE HOME OF THE "hr_leaderboard CALLS hr_rpc_gate" INVARIANT —
       the one that keeps getting knocked over (Security review C2 asked for it
       explicitly). It is asserted HERE, and not in
       tests/leaderboard-lockdown-guard.mjs where it might seem to belong,
       because that guard CANNOT CURRENTLY BOOT: it replays the whole declared
       chain — which already contains 2026-08-14-leaderboard-view-lockdown.sql
       — and then tries to reproduce the pre-lockdown state, so its BEFORE
       phase dies on `anon could not read public.leaderboard (42P01)` and it
       exits 2 before reaching a single assertion. MEASURED, and measured to be
       PRE-EXISTING: identical failure with this migration removed and the
       manifest reverted. It is also not wired into tests/run-smoke.mjs (only
       the `test:lb-lockdown` npm script). An assertion added there would never
       run. Reported to the Coordinator rather than silently fixed, since
       repairing it means changing another migration's guard (its BEFORE phase
       needs bootReplay's `upTo` to stop short of the lockdown file).
       Mutant M8 proves the assertion below actually bites. */
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
    + `board; a server-written 5000 xp moved skill:mining and total_level; 5000 gold moved no board.`,
    `LB: ${skills.length} skill boards + total_level/level, one row per HERO under its own name, sourced from `
    + 'player_state + player_skills; renown + bosses unsourced; wealth + clan_power cut; hidden heroes hold no place; '
    + 'a blocked name reads "Name hidden"; ties share a place.',
    `LB: refresh churn over ${idle.rows} ranked rows — idle ${idle.rewritten} rewritten, after `
    + `EVERY player settled ${settled.rewritten} rewritten, after a real xp gain `
    + `${moved.rewritten} rewritten + ${moved.added} added. Steady-state WAL is zero because `
    + '`concurrently` already diffs and no ranked column moves on its own.',
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
/* The view, its revoke and the reader are RESTATED last by 2027-02-12-leaderboard-heroes.sql (one row per hero,
   by the hero's name). A mutant of the view or the reader must be planted in THAT body, or the later restatement
   silently undoes it and the mutant proves nothing. Its §7 self-check is blinded so the behaviour is what fails. */
const VIEW = 'supabase/migrations/2027-02-12-leaderboard-heroes.sql';
const BLIND_VIEW = [['  v_place_a bigint; v_place_b bigint; v_rank_a bigint; v_rank_b bigint;\nbegin\n',
  '  v_place_a bigint; v_place_b bigint; v_rank_a bigint; v_rank_b bigint;\nbegin\n  return; -- MUTATION HARNESS: §7 disabled so the BEHAVIOUR is what fails\n']];
/* `return` in a DO block ends it, so §6 stops before its first assertion. */
const BLIND2 = [["  if to_regclass('public.leaderboard_ranked') is null then\n"
  + "    raise exception 'leaderboard_ranked missing';\n  end if;",
'  return; -- MUTATION HARNESS: §6 disabled so the BEHAVIOUR is what fails']];

const MUTANTS = [
  {
    id: 'M1', file: VIEW,
    what: 'the boards go back to slot 0 of each ACCOUNT, so a second hero never ranks',
    edits: [['  from public.player_state ps\n  where not exists (select 1 from public.hr_lb_hidden h',
      '  from public.player_state ps\n  where ps.slot = 0 and not exists (select 1 from public.hr_lb_hidden h'], ...BLIND_VIEW],
  },
  {
    id: 'M2', file: VIEW,
    what: 'the F5 revoke is dropped, so the recreated matview re-inherits the schema default '
      + 'grant and anon can dump every player again',
    edits: [['revoke all on public.leaderboard_ranked from public, anon, authenticated, service_role;',
      '-- revoke removed by the mutation harness'], ...BLIND_VIEW],
  },
  {
    id: 'M3', file: VIEW,
    what: 'renown goes back to ranking snapshot->>\'renown\' (a board still sourced from the blob '
      + 'while the rebuild claims to be done)',
    edits: [["  -- NOTE: no 'renown', 'bosses', 'wealth' or 'clan_power' branch (§2).",
      "  union all\n  select 'renown', h.user_id, h.slot, h.name,\n"
      + "         public.hr_lb_num(gs.snapshot, 'renown'), 1\n"
      + '  from heroes h join public.game_saves gs on gs.user_id = h.user_id and gs.slot = h.slot\n'
      + "  -- NOTE: no 'renown', 'bosses', 'wealth' or 'clan_power' branch (§2)."], ...BLIND_VIEW],
  },
  {
    id: 'M4', file: VIEW,
    what: 'the name goes back to the ACCOUNT\'s display name (every hero of an account, and every '
      + 'account with no claimed name, reads the same)',
    edits: [['         public.hr_character_name(ps.user_id, ps.slot) as name\n',
      "         coalesce((select p.display_name from public.profiles p where p.id = ps.user_id), 'Adventurer') as name\n"],
    ...BLIND_VIEW],
  },
  {
    id: 'M5', file: VIEW,
    what: 'wealth comes back as an account board (the purse under a hero\'s name)',
    edits: [["  select array['renown','total_level','level','bosses']\n",
      "  select array['renown','total_level','level','wealth','bosses']\n"],
    ["  -- NOTE: no 'renown', 'bosses', 'wealth' or 'clan_power' branch (§2).",
      "  union all\n  select 'wealth', h.user_id, h.slot, h.name, coalesce(w.gold, 0), 1\n"
      + '  from heroes h left join public.account_wallet w on w.user_id = h.user_id\n'
      + "  -- NOTE: no 'renown', 'bosses', 'wealth' or 'clan_power' branch (§2)."], ...BLIND_VIEW],
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
    id: 'M6', file: VIEW,
    what: 'Total Level reads every skill on the capped 99 table, so a combat skill counts at the wrong '
      + 'level and the board disagrees with the player\'s own screen (was: the combat-level coalesce, deleted)',
    edits: [['  select s.user_id, s.slot, s.skill_id, s.xp, public.hr_skill_level(s.skill_id, s.xp) as level',
      '  select s.user_id, s.slot, s.skill_id, s.xp, public.hr_level_from_xp(s.xp) as level'], ...BLIND_VIEW],
  },
  {
    /* THE WAL CHURN, RESTORED: a ranked column that moves on every settle (player_state.updated_at), so every
       active hero's rows rewrite on every 5-minute refresh and `concurrently`'s diff saves nothing. */
    id: 'M9', file: VIEW,
    what: 'a per-settle timestamp rides in a ranked row (the level column carries player_state.updated_at), '
      + 'so every active hero\'s rows churn on every refresh',
    edits: [["  select 'level', h.user_id, h.slot, h.name, h.level_xp, public.hr_char_level(h.level_xp)\n  from heroes h\n",
      "  select 'level', h.user_id, h.slot, h.name, h.level_xp,\n"
      + "         public.hr_char_level(h.level_xp) + (extract(epoch from (select ps2.updated_at from public.player_state ps2\n"
      + '           where ps2.user_id = h.user_id and ps2.slot = h.slot))::bigint % 1000)::int\n  from heroes h\n'], ...BLIND_VIEW],
  },
  {
    id: 'M10', file: VIEW,
    what: 'the hide list is ignored, so a test or banned account ranks',
    edits: [['  where not exists (select 1 from public.hr_lb_hidden h\n                     where h.user_id = ps.user_id and (h.slot is null or h.slot = ps.slot))\n',
      '  where not exists (select 1 from public.hr_lb_hidden h\n                     where h.user_id = ps.user_id and (h.slot is null or h.slot = ps.slot) and false)\n'],
    ...BLIND_VIEW],
  },
  {
    id: 'M11', file: VIEW,
    what: 'a name the blocklist refuses is published as it stands',
    edits: [["           'name', case when public.hr_name_blocked(r.name) then 'Name hidden' else r.name end,",
      "           'name', r.name,"], ...BLIND_VIEW],
  },
  {
    id: 'M12', file: VIEW,
    what: 'every row publishes the ranked player\'s account uuid again',
    edits: [["           'rank', r.rank, 'place', r.place,\n",
      "           'rank', r.rank, 'place', r.place, 'id', r.user_id,\n"], ...BLIND_VIEW],
  },
  {
    id: 'M13', file: VIEW,
    what: 'the caller\'s mark follows the slot, not the account, so another player\'s slot-0 hero reads as yours',
    edits: [['         || case when p_viewer is not null and r.user_id = p_viewer\n',
      '         || case when p_viewer is not null and r.slot = 0\n'], ...BLIND_VIEW],
  },
  {
    /* THE ONE-WAY DOOR, IN THE FILE THAT NOW OWNS THE READER: replacing the PUBLIC name deletes the A9
       rate-gate wrapper. The 2026-08-18 twin of this mutant (M8 below) is now refused by this file's §0. */
    id: 'M8b', file: VIEW,
    what: 'the hero reader replaces the PUBLIC hr_leaderboard instead of the __ungated twin, deleting the A9 '
      + 'rate-gate wrapper (the one-way door)',
    edits: [['create or replace function public.hr_leaderboard__ungated(\n  p_board text,',
      'create or replace function public.hr_leaderboard(\n  p_board text,'],
    ['revoke all on function public.hr_leaderboard__ungated(text, int, int)\n  from public, anon, authenticated, service_role;\n\n-- ── §6',
      'revoke all on function public.hr_leaderboard(text, int, int) from public;\n'
      + 'grant execute on function public.hr_leaderboard(text, int, int) to anon, authenticated;\n\n-- ── §6'],
    ...BLIND_VIEW],
  },
  {
    /* ⚠ SINCE 2027-02-12-leaderboard-heroes.sql THIS MUTANT IS REFUSED BY THAT FILE'S §0 (the public name must
       be the A9 wrapper before it restates the twin), so it is caught by the chain refusing to install, not by
       LB-11. LB-11's own bite is proven by M8b, the same defect planted in the file that now owns the reader. */
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
    /* ⚠ THE ANCHOR CARRIES THE PARAMETER LIST ON PURPOSE. The bare
       `create or replace function public.hr_leaderboard__ungated(` now appears
       TWICE — once as the real statement, once inside the C2 reversibility
       block in the header, which spells out the supported revert. The harness
       caught that itself (anchor matched 2 times, must match 1) and refused to
       report a verdict, which is the behaviour that keeps a "CAUGHT" honest. */
    edits: [['create or replace function public.hr_leaderboard__ungated(\n  p_board text,',
      'create or replace function public.hr_leaderboard(\n  p_board text,'],
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

if (isMain(import.meta.url)) {
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
