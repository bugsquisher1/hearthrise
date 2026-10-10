#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bestiary-target.mjs — A BOUNTY KILL MUST BE A KILL OF THE TARGET.
//
//   node tests/bestiary-target.mjs            the guard (whole chain)
//   node tests/bestiary-target.mjs --repro    the forge on the chain WITHOUT the fix
//                                             (exit 0 = reproduced, 1 = did not)
//   node tests/bestiary-target.mjs --mutate   every planted defect must be CAUGHT
//                                  [--only=<id>]  one mutant
//
// Ships with supabase/migrations/2026-10-17-bestiary-target.sql.
//
// THE FORGE (Security, PLAUSIBLE from a code read; --repro proves it): with the
// pointer on goblins, hr_accept_bounty took a contract on ANY monster (bosses
// included) and hr_credit_kills priced its cap window from "time in combat"
// against any monster, so the bestiary row ev:kill_monster:<X> — hunterAll's
// count, renown's count, the contract's turn-in — rose for a monster never
// fought.
//
// ARMS
//   D1  the migration's allowlist == src/data/monsters.js minus boss/champion
//   D2  2,000 seeded boards (every combat band) post only allowlisted monsters
//   A0  the engine's input surface has no bounty key (it cannot price a target)
//   A1  AWAY, engine: an hour on goblins writes ev:kill_monster:goblin only
//   A2  AWAY, engine control: an hour on X writes ev:kill_monster:X only
//   B1  a second apply is byte-identical
//   F1  a boss contract is refused not_board_eligible (journalled); X accepted
//   F2  ATTENDED forge: an hour on goblins credits X zero (off_target)
//   F3  a switch onto X at credit time is not paid the goblin hour
//   H1  ATTENDED honest: an hour on X credits X
//   H4  two on-target credits do not count the same interval twice
//   H2  earned target time survives a switch away (hold-retry) and does not grow
//   W1  AWAY, through hr_apply: a goblin settle moves no X progress
//   W2  AWAY control, through hr_apply: an X settle moves X progress
// --mutate replays only UP TO this file (tests/schema-replay.mjs replayScopeError).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, inventory, ROOT } from './schema-replay.mjs';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { generateBountyBoard } from '../src/core/bounty.js';
import { createRng } from '../src/core/rng.js';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { ENGINE_INPUT_KEYS } from '../supabase/functions/hr-accrue/envelope.js';

const MIG = '2026-10-17-bestiary-target.sql';
const PRE = '2026-10-15-party-hunt-select-lockdown.sql';   // the chain end before this file
const S5 = '-- ── 5. SELF-VERIFYING COMMIT GATE (CLAUDE.md §4) — EXECUTED ─────────────────\ndo $$';
const offS5 = [S5, S5.replace('do $$', () => 'create or replace function pg_temp.bt_s5_off() returns void language plpgsql as $$')];
const MUTATIONS = {
  accept_any: { why: 'hr_accept_bounty takes any catalogued monster again (bosses included)', expect: 'F1',
    pairs: [offS5, ['  if not exists (select 1 from public.hr_bounty_board_monsters where monster_id = p_target) then',
      '  if false then']] },
  kind_only: { why: 'the target fence reads active_kind only: any fight buys any target', expect: 'F2',
    pairs: [offS5, ["    v_on_target := (v_active_kind = 'combat' and v_active_id = p_target);",
      "    v_on_target := (v_active_kind = 'combat');"]] },
  no_switch_floor: { why: 'the run starts at accept, not at the switch onto the target: a late switch is paid the goblin hour', expect: 'F3',
    pairs: [offS5, ['                             coalesce(v_active_since, now()),\n', '']] },
  no_mark_floor: { why: 'the run does not start at the previous on-target credit: every credit re-counts the whole run', expect: 'H4',
    pairs: [offS5, [',\n                             coalesce(v_ab.fight_mark, v_ab.accepted_at))\n', ')\n']] },
  not_persisted: { why: 'fight_ms is never written back: earned target time is lost on a switch', expect: 'H2',
    pairs: [offS5, ['      update public.active_bounty set fight_ms = v_fight, fight_mark = now()\n       where user_id = v_uid and slot = v_slot;\n', '']] },
  boss_allowlisted: { why: 'a boss is added to the board allowlist', expect: 'D1',
    pairs: [offS5, ["'wraith', 'wyrmling',", "'wraith', 'dragon', 'wyrmling',"],
      ["if v_n <> 94 then raise exception '§1:", "if v_n <> 95 then raise exception '§1:"]] },
};

const BOARD = Object.keys(MONSTERS).filter((id) => !MONSTERS[id].boss && !MONSTERS[id].champion).sort();
const X = BOARD.find((id) => MONSTERS[id].tier === 1 && id !== 'goblin');
const BOSS = Object.keys(MONSTERS).filter((id) => MONSTERS[id].boss).sort()[0];
const MAXED = 13034431;

function engineKills(activeId, nowMs) {
  const r = computeAccrual({
    userId: '00000000-0000-4000-8000-0000000be571', slot: 0,
    nowMs, accruedToMs: nowMs - 3600000, activeSinceMs: nowMs - 3600000,
    activeKind: 'combat', activeId, capMs: 12 * 3600000, seed: 0x5eedbe57, hp: 99, maxHp: 99,
    skills: { attack: MAXED, strength: MAXED, defense: MAXED, hitpoints: MAXED, ranged: 0, magic: 0, prayer: 0 },
    gold: 0, equipment: {}, items: ITEMS, monsters: MONSTERS,
  });
  const prog = (r.delta && r.delta.progress) || [];
  return { r, prog, keys: prog.filter((p) => /^ev:kill_monster:/.test(p.key)) };
}

async function migText(mutate) {
  let sql = (await readFile(join(ROOT, 'supabase', 'migrations', MIG), 'utf8')).replace(/\r\n/g, '\n');
  if (mutate) for (const [f, r] of MUTATIONS[mutate].pairs) sql = sql.replace(f, () => r);
  return sql;
}

/** One real player, created the server's own way, maxed in combat. */
async function fixture(db, q, asUser) {
  const uid = (await q('select gen_random_uuid() as i'))[0].i;
  await q("insert into auth.users (id, instance_id, aud, role, email) values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','bt@probe.invalid')", [uid]);
  await q('insert into public.profiles (id) values ($1) on conflict do nothing', [uid]);
  await q('delete from public.hr_rate_counters');
  await asUser(uid, 'select public.claim_display_name($1) as r', ['BtProbe']);
  const cr = await asUser(uid, 'select public.hr_create_character(0) as r');
  if (cr?.ok !== true) { const e = new Error(`FIXTURE: hr_create_character refused: ${JSON.stringify(cr)}`); e.harness = true; throw e; }
  await q(`insert into public.player_skills (user_id, slot, skill_id, xp)
           select $1, 0, s, $2 from unnest(array['attack','strength','defense','hitpoints','prayer','ranged','magic']) s
           on conflict (user_id, slot, skill_id) do update set xp = excluded.xp`, [uid, MAXED]);
  return uid;
}

/** The forge, as a client would send it. Returns the observations. */
async function forge(db, q, asUser, uid) {
  const gate = () => q('delete from public.hr_rate_counters');
  const point = (id, ago) => q(`update public.player_state set active_kind = 'combat', active_id = $2,
      active_since = now() - ($3 || ' seconds')::interval, accrued_to = now() where user_id = $1 and slot = 0`, [uid, id, String(ago)]);
  const kills = async (id) => Number((await q(`select coalesce(max(value),0)::text v from public.player_progress
      where user_id = $1 and slot = 0 and kind = 'stat' and period_key = '' and key = $2`, [uid, 'ev:kill_monster:' + id]))[0].v);
  const accept = async (id, bid) => { await gate(); return asUser(uid, 'select public.hr_accept_bounty(0,$1,$2,$3,$4,$5) as r', [bid, id, 'cull', 'normal', 50]); };
  const credit = async (id, n, idem) => { await gate(); return asUser(uid, 'select public.hr_credit_kills(0,$1,$2,$3) as r', [id, n, idem]); };
  const o = {};
  await point('goblin', 3600);
  o.bossAccept = await accept(BOSS, 'bt-boss');
  await q('delete from public.active_bounty where user_id = $1', [uid]);
  o.xAccept = await accept(X, 'bt-x');
  await q("update public.active_bounty set accepted_at = now() - interval '1 hour' where user_id = $1", [uid]);
  o.xBefore = await kills(X);
  o.forge = await credit(X, 50, 'bt-forge-1');
  o.xAfterForge = await kills(X);
  o.logRows = Number((await q('select count(*)::int n from public.hr_kill_credit_log where user_id = $1', [uid]))[0].n);
  return { o, point, kills, accept, credit, gate };
}

async function run(mutate) {
  const fails = [];
  const ok = (arm, cond, msg) => { if (!cond) fails.push(`${arm}: ${msg}`); };
  const sqlText = await migText(mutate);

  // ── D1 / D2: the allowlist is the board's own rule ───────────────────────
  {
    const m = /v_ids text\[\] := array\[([\s\S]*?)\];/.exec(sqlText);
    const ids = m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort() : [];
    ok('D1', JSON.stringify(ids) === JSON.stringify(BOARD),
      `the migration allowlist (${ids.length}) is not monsters.js minus boss/champion (${BOARD.length}); `
      + `extra ${ids.filter((i) => !BOARD.includes(i)).join(',') || '-'} missing ${BOARD.filter((i) => !ids.includes(i)).join(',') || '-'}`);
    ok('D1', new RegExp(`if v_n <> ${BOARD.length} then`).test(sqlText), `the §1 row-count assertion is not ${BOARD.length}`);
    const allow = new Set(BOARD);
    let bad = 0, n = 0;
    for (let s = 0; s < 2000; s++) {
      const cl = [1, 12, 25, 40, 55, 70, 126][s % 7];
      const out = generateBountyBoard({ monsters: MONSTERS, items: ITEMS, combatLevel: cl, bountyLevel: 1 + (s % 60),
        ownedTypes: new Set(['sword']), rng: createRng(0xbe57 + s), now: 0, clientMayPay: false });
      for (const b of out.board) { n++; if (!allow.has(b.target)) bad++; }
    }
    ok('D2', n === 6000 && bad === 0, `${bad} of ${n} board offers name a monster outside the allowlist`);
  }

  // ── A0-A2: the AWAY engine prices the pointer's monster and nothing else ─
  {
    ok('A0', !ENGINE_INPUT_KEYS.some((k) => /bount|target/i.test(k)), `the engine takes a bounty/target input: ${ENGINE_INPUT_KEYS.join(',')}`);
    const now = Date.now();
    const g = engineKills('goblin', now);
    ok('A1', g.keys.length === 1 && g.keys[0].key === 'ev:kill_monster:goblin' && g.keys[0].add > 0,
      `an hour on goblins wrote ${JSON.stringify(g.keys)}`);
    const x = engineKills(X, now);
    ok('A2', x.keys.length === 1 && x.keys[0].key === `ev:kill_monster:${X}` && x.keys[0].add > 0,
      `an hour on ${X} wrote ${JSON.stringify(x.keys)}`);
  }

  const patches = mutate ? new Map([[MIG, MUTATIONS[mutate].pairs]]) : undefined;
  const { db } = await bootReplay(mutate ? { patches, upTo: MIG } : {});
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };
  try {
    // ── B1. SECOND APPLY IS BYTE-IDENTICAL ─────────────────────────────────
    const bodies = () => q(`select p.proname, md5(p.prosrc) h, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('hr_accept_bounty__ungated','hr_credit_kills__ungated') order by 1`);
    const rows = () => q('select monster_id from public.hr_bounty_board_monsters order by 1');
    {
      const before = JSON.stringify([await inventory(db), await bodies(), await rows()]);
      let err = null;
      try { await db.exec(sqlText); } catch (e) { err = String(e.message).split('\n')[0]; }
      ok('B1', !err, `a second apply raised: ${err}`);
      ok('B1', before === JSON.stringify([await inventory(db), await bodies(), await rows()]), 'a second apply changed the schema, a body or the allowlist');
    }

    const uid = await fixture(db, q, asUser);
    const { o, point, kills, credit, accept } = await forge(db, q, asUser, uid);

    // ── F1 ──
    ok('F1', o.bossAccept?.error === 'not_board_eligible', `accepting the boss ${BOSS} answered ${JSON.stringify(o.bossAccept)}`);
    const rj = Number((await q("select count(*)::int n from public.hr_rejections where user_id = $1 and code = 'not_board_eligible'", [uid]))[0].n);
    ok('F1', rj >= 1, 'not_board_eligible was not journalled in hr_rejections');
    ok('F1', o.xAccept?.ok === true, `CONTROL: accepting board monster ${X} answered ${JSON.stringify(o.xAccept)}`);
    // ── F2 ──
    ok('F2', o.forge?.reason === 'off_target' && Number(o.forge?.credited) === 0 && o.xAfterForge === o.xBefore && o.logRows === 0,
      `an hour on goblins credited ${X}: ${JSON.stringify(o.forge)}, bestiary ${o.xBefore} -> ${o.xAfterForge}, log rows ${o.logRows}`);
    // ── F3 ──
    await point(X, 0);
    const f3 = await credit(X, 50, 'bt-switch-1');
    ok('F3', Number(f3?.credited) === 0 && (await kills(X)) === o.xBefore, `a switch onto ${X} at credit time was paid: ${JSON.stringify(f3)}`);
    // ── H1 ──
    await point(X, 3600);
    await q('update public.active_bounty set fight_ms = 0, fight_mark = null where user_id = $1', [uid]);
    const h1 = await credit(X, 5, 'bt-honest-1');
    ok('H1', Number(h1?.credited) === 5 && (await kills(X)) === 5, `an hour on ${X} answered ${JSON.stringify(h1)}`);
    // ── H4 ──
    const fight1 = Number((await q('select fight_ms::text f from public.active_bounty where user_id = $1', [uid]))[0].f);
    const h4 = await credit(X, 6, 'bt-honest-2');
    const fight2 = Number((await q('select fight_ms::text f from public.active_bounty where user_id = $1', [uid]))[0].f);
    ok('H4', fight1 >= 3600000 && fight2 - fight1 < 120000,
      `two on-target credits grew fight_ms ${fight1} -> ${fight2} (the second re-counted the run): ${JSON.stringify(h4)}`);
    // ── H2 ──
    await point('goblin', 0);
    const h2 = await credit(X, 9, 'bt-retry-1');
    const fight3 = Number((await q('select fight_ms::text f from public.active_bounty where user_id = $1', [uid]))[0].f);
    ok('H2', Number(h2?.credited) === 3 && (await kills(X)) === 9 && fight3 === fight2,
      `a hold-retry after a switch answered ${JSON.stringify(h2)}, bestiary ${await kills(X)}, fight_ms ${fight2} -> ${fight3}`);

    // ── W1 / W2: the AWAY settle, through hr_apply as the engine sends it ──
    const settle = async (id) => {
      const v = (await q('select version::text v from public.player_state where user_id = $1 and slot = 0', [uid]))[0].v;
      const { prog } = engineKills(id, Date.now());
      return (await q('select public.hr_apply($1::uuid, 0, $2::bigint, gen_random_uuid(), $3::text::jsonb) as r',
        [uid, v, JSON.stringify({ progress: prog, journal: { kind: 'accrue', intent: 'bestiary-target:settle' } })]))[0].r;
    };
    const progress = async () => {
      const r = (await q('select public.hr_state_of($1, 0) as r', [uid]))[0].r;
      return r && r.bounty ? Number(r.bounty.progress) : null;
    };
    const x0 = await kills(X), g0 = await kills('goblin'), p0 = await progress();
    await point('goblin', 0);
    const w1 = await settle('goblin');
    ok('W1', w1?.ok === true && (await kills(X)) === x0 && (await progress()) === p0 && (await kills('goblin')) > g0,
      `a goblin settle answered ${JSON.stringify(w1)?.slice(0, 200)}; ${X} ${x0}->${await kills(X)}, progress ${p0}->${await progress()}, goblin ${g0}->${await kills('goblin')}`);
    await point(X, 0);
    const w2 = await settle(X);
    const gained = engineKills(X, Date.now()).keys[0]?.add || 0;
    ok('W2', w2?.ok === true && (await kills(X)) > x0 && (await progress()) > p0,
      `an ${X} settle answered ${JSON.stringify(w2)?.slice(0, 200)}; ${X} ${x0}->${await kills(X)} (engine ${gained}), progress ${p0}->${await progress()}`);
    void accept;
  } finally {
    await db.close().catch(() => {});
  }
  return fails;
}

async function repro() {
  const { db } = await bootReplay({ upTo: PRE });
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const asUser = async (uid, sql, p) => {
    await q("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await q('set role authenticated');
    try { return (await db.query(sql, p)).rows[0]?.r; } finally { await db.query('reset role').catch(() => {}); }
  };
  try {
    const uid = await fixture(db, q, asUser);
    const { o } = await forge(db, q, asUser, uid);
    const bossOk = o.bossAccept?.ok === true;
    const forged = Number(o.forge?.credited) > 0 && o.xAfterForge > o.xBefore;
    console.log(`--repro on the chain ending ${PRE} (no fix):`);
    console.log(`  F1 boss contract (${BOSS}) accepted: ${bossOk}  ${JSON.stringify(o.bossAccept)}`);
    console.log(`  F2 an hour on goblins credited ${X}: ${forged}  bestiary ${o.xBefore} -> ${o.xAfterForge}  ${JSON.stringify(o.forge)}`);
    console.log(bossOk && forged ? 'REPRODUCED' : 'NOT REPRODUCED');
    return bossOk && forged;
  } finally { await db.close().catch(() => {}); }
}

const argv = process.argv.slice(2);
try {
  if (!X || !BOSS) { console.error('bestiary-target: HARNESS ERROR — no tier-1 board monster or no boss in src/data/monsters.js'); process.exit(2); }
  if (argv.includes('--repro')) process.exit((await repro()) ? 0 : 1);
  if (argv.includes('--mutate')) {
    let bad = 0;
    const only = (argv.find((a) => a.startsWith('--only=')) || '').slice(7);
    for (const [id, m] of Object.entries(MUTATIONS)) {
      if (only && id !== only) continue;
      const fails = await run(id);
      const hit = fails.some((f) => f.startsWith(m.expect + ':'));
      console.log(`${hit ? 'CAUGHT ' : 'MISSED '} ${id} (${m.expect}) — ${m.why}${hit ? '' : `\n        saw: ${fails.join(' | ') || 'green'}`}`);
      if (!hit) bad++;
    }
    process.exit(bad ? 1 : 0);
  }
  const fails = await run(null);
  if (fails.length) { console.error('bestiary-target: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log(`bestiary-target: OK — ${BOARD.length}-monster allowlist matches the data and 2,000 boards; the away engine prices only the pointer's monster; `
    + `second apply byte-identical; boss contract refused; an hour on goblins credits ${X} zero; a late switch credits zero; `
    + 'an hour on target credits; no interval counted twice; earned time survives a switch; a goblin settle moves no target progress, a target settle does');
} catch (e) {
  console.error('bestiary-target: HARNESS ERROR — ' + (e && e.stack || e)); process.exit(2);
}
