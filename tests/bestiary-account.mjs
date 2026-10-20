#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/bestiary-account.mjs — THE ACCOUNT BESTIARY (Tyler 2026-10-19).
//
//   node tests/bestiary-account.mjs            the guard (every arm)
//   node tests/bestiary-account.mjs --mutate   every planted defect must be CAUGHT by its arm
//
// The bestiary is ACCOUNT-wide: every character of an account adds to one kill
// count per monster. At 1,250 / 2,500 / 5,000 / 10,000 kills a stage is reached;
// activating it costs a server-priced gold fee and raises that monster's RELIC
// drop chance x1.05 / x1.12 / x1.18 / x1.25 — relic rows only, nothing else.
//   B-STAGES  the data: the thresholds, the multipliers, the fee formula, stageAt
//   B-DROPS   src/core/drops.js lifts ONLY a `tier: 'relic'` row, before the 0.95
//             cap, and honours nothing but a number in 1..MAX_RELIC_MULT
//   B-REWARDS src/core/hunt-rewards.js hands the member's relicMult(monster) to the
//             drop roll (and 1 when the member has none)
//   B-DATA    the generated SQL catalogue equals the data, the SQL fee equals the
//             data's for every ground monster and stage
//   B-SHARED  two characters of ONE account: kills from the REAL hunt settle on one
//             and an hr_apply kill op on the other land on ONE account count; the
//             projection is the same on both; a monster outside the bestiary is not
//             counted; a second account sees none of it
//   B-FEE     hr_bestiary_activate as `authenticated`: refused below the kills,
//             without gold, at a stale price, for a relic-less monster, out of
//             order and twice; the fee once, one ledger row, idempotent on its key;
//             the stage is the account's (the other character's projection and
//             relic map carry it); no client role writes the table or reads the view
//   B-IDEM    a second apply of both 2026-10-28 files is byte-identical
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const MUTATE = process.argv.includes('--mutate');
const FILES = Object.freeze(['2026-10-28-bestiary-catalogue.generated.sql', '2026-10-28-bestiary-account.sql']);
const idem = () => crypto.randomUUID();
const near = (a, b) => Math.abs(a - b) < 1e-12;

async function modules(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return {
    ST: await import(u('src/data/bestiary-stages.js')),
    DR: await import(u('src/core/drops.js')),
    HR: await import(u('src/core/hunt-rewards.js')),
    MON: await import(u('src/data/monsters.js')),
    GEN: await import(u('tools/gen-bestiary-catalogue.mjs')),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ENGINE ARMS (no database)
// ═══════════════════════════════════════════════════════════════════════
const ENGINE_ARMS = {
  'B-STAGES': async ({ ST }) => {
    const p = [];
    const want = [[1250, 1.05, 1], [2500, 1.12, 2], [5000, 1.18, 4], [10000, 1.25, 8]];
    want.forEach(([kills, mult, feeMult], i) => {
      const r = ST.BESTIARY_STAGES[i];
      if (!r || r.stage !== i + 1 || r.kills !== kills || r.relicPermille / 1000 !== mult || r.feeMult !== feeMult) {
        p.push(`stage ${i + 1} is ${JSON.stringify(r)}, the ruling is ${kills} kills, relic x${mult}, fee x${feeMult}`);
      }
      if (ST.stageAt(kills - 1) !== i || ST.stageAt(kills) !== i + 1) p.push(`stageAt around ${kills} reads ${ST.stageAt(kills - 1)} / ${ST.stageAt(kills)}`);
      if (!near(ST.relicMultFor(i + 1), mult)) p.push(`relicMultFor(${i + 1}) is ${ST.relicMultFor(i + 1)}, not ${mult}`);
    });
    if (ST.BESTIARY_STAGES.length !== 4) p.push(`the ladder has ${ST.BESTIARY_STAGES.length} stages, not 4`);
    if (ST.relicMultFor(0) !== 1 || ST.stageAt(0) !== 0 || ST.stageAt(NaN) !== 0) p.push('no stage must pay x1 and read stage 0');
    if (ST.MAX_RELIC_MULT !== 1.25) p.push(`MAX_RELIC_MULT is ${ST.MAX_RELIC_MULT}`);
    /* The fee: feeMult x (base + perLevel x monster level). */
    if (ST.stageFee(1, 2) !== 300 || ST.stageFee(4, 52) !== 22400 || ST.stageFee(5, 2) !== null) {
      p.push(`the fee formula moved: stage 1 level 2 ${ST.stageFee(1, 2)} (300), stage 4 level 52 ${ST.stageFee(4, 52)} (22,400)`);
    }
    const bad = ST.validate();
    if (bad.length) p.push('validate(): ' + bad.join('; '));
    return p;
  },

  'B-DROPS': async ({ DR, ST }) => {
    const p = [];
    const relic = { id: 'x_relic', ch: 0.001, tier: 'relic' };
    const rare = { id: 'x_rare', ch: 0.01 };
    const eff = (row, relicMult) => DR.effectiveDropChance(row, { relicMult });
    if (!near(eff(relic, 1.25), 0.00125)) p.push(`a relic row at x1.25 reads ${eff(relic, 1.25)}, not 0.00125`);
    if (!near(eff(rare, 1.25), 0.01)) p.push(`a non-relic row was lifted by relicMult: ${eff(rare, 1.25)}`);
    for (const forged of [0.5, NaN, '2', null, undefined, -3]) {
      if (!near(eff(relic, forged), 0.001)) p.push(`relicMult ${String(forged)} moved a relic row to ${eff(relic, forged)}`);
    }
    if (!near(eff(relic, 9), 0.001 * ST.MAX_RELIC_MULT)) p.push(`relicMult 9 is not clamped to MAX_RELIC_MULT: ${eff(relic, 9)}`);
    if (DR.effectiveDropChance({ id: 'r', ch: 0.9, tier: 'relic' }, { relicMult: 1.25 }) !== 0.95) p.push('the 0.95 cap no longer holds over a lifted relic row');
    /* The walk: the same dice land the lifted relic and not the plain one. */
    const rng = (v) => ({ chance: (q) => v < q });
    const got = DR.rollDropTable([relic], { relicMult: 1.25 }, rng(0.0011));
    const plain = DR.rollDropTable([relic], {}, rng(0.0011));
    if (got.dropped.x_relic !== 1 || plain.dropped.x_relic) p.push(`the walk ignores relicMult (lifted ${JSON.stringify(got.dropped)}, plain ${JSON.stringify(plain.dropped)})`);
    return p;
  },

  'B-REWARDS': async ({ HR }) => {
    const p = [];
    const monsters = { testmon: { name: 'T', gp: [0, 0], drops: [{ id: 'bones', ch: 0.4 }, { id: 'tmon_relic', ch: 0.002, tier: 'relic' }] } };
    const roll = (relicMult) => {
      const seen = [];
      const member = { state: {}, hs: { tally: { kills: 0 } }, fx: {}, weakness: () => ({ dropMult: 1 }), bonus: () => 0 };
      if (relicMult) member.relicMult = relicMult;
      const world = { units: [{ id: 1, side: 'hero' }, { id: 2, side: 'mon', kind: 'testmon' }] };
      const ctx = { monsters, hearthfind: false, rng: { int: (a) => a, chance: (q) => { seen.push(q); return false; } } };
      HR.rewardSwing(new Map([[1, member]]), [{ type: 'kill', u: 1, t: 2 }], world, ctx);
      return seen;
    };
    const asked = [];
    const lifted = roll((id) => { asked.push(id); return 1.25; });
    if (!near(lifted[0], 0.4) || !near(lifted[1], 0.0025)) p.push(`a member at x1.25 rolled ${JSON.stringify(lifted)}, want [0.4, 0.0025]`);
    if (asked[0] !== 'testmon') p.push(`relicMult was asked for ${JSON.stringify(asked)}, not the killed monster's id`);
    const none = roll(null);
    if (!near(none[1], 0.002)) p.push(`a member with no relicMult rolled the relic at ${none[1]}`);
    return p;
  },
};

// ═══════════════════════════════════════════════════════════════════════
// DB ARMS (the real chain)
// ═══════════════════════════════════════════════════════════════════════
async function asAuth(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally { await db.exec('reset role'); }
}
const refusedAsAuth = async (db, uid, sql) => {
  await db.query('savepoint b_auth');
  try { await asAuth(db, uid, sql); await db.query('release savepoint b_auth'); return false; }
  catch { await db.query('rollback to savepoint b_auth'); await db.exec('reset role'); return true; }
};
const section = async (H, db, uid, slot) => H.one(db, `select public.hr_state_of($1, $2)->'account_bestiary'`, [uid, slot]);
const rowOf = (s, monster) => (s && s.monsters || []).find((m) => m.monster === monster);
const killOp = async (H, db, uid, slot, monster, n) => {
  const ver = await H.one(db, 'select version from public.player_state where user_id = $1 and slot = $2', [uid, slot]);
  const r = await H.one(db, 'select public.hr_apply($1, $2, $3, $4::uuid, $5::jsonb)', [uid, slot, ver, idem(),
    JSON.stringify({ progress: [{ kind: 'stat', key: 'ev:kill_monster:' + monster, add: n }] })]);
  if (!r || r.ok !== true) throw new Error('kill op refused: ' + JSON.stringify(r));
};
const secondCharacter = async (H, db, uid) => {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  const c = await H.one(db, 'select public.hr_create_character(1)');
  if (!c || c.ok !== true) throw new Error('slot 1 refused: ' + JSON.stringify(c));
};

const DB_ARMS = {
  'B-DATA': async (db, { H, X }) => {
    const p = [];
    const stages = await H.q(db, 'select stage, kills, relic_permille, fee_mult from public.hr_bestiary_stages order by stage');
    const want = X.ST.BESTIARY_STAGES.map((s) => [s.stage, s.kills, s.relicPermille, s.feeMult]);
    if (JSON.stringify(stages.map((r) => [r.stage, Number(r.kills), r.relic_permille, r.fee_mult])) !== JSON.stringify(want)) {
      p.push(`hr_bestiary_stages ${JSON.stringify(stages)} is not the data ${JSON.stringify(want)}`);
    }
    const roster = X.GEN.bestiaryRoster();
    const mons = await H.q(db, 'select monster_id, hunt_id, rarity, ord, has_relic from public.hr_bestiary_monsters order by ord');
    if (JSON.stringify(mons.map((r) => [r.monster_id, r.hunt_id, r.rarity, r.ord, r.has_relic]))
      !== JSON.stringify(roster.map((r) => [r.monster, r.hunt, r.rarity, r.ord, r.relic]))) p.push('hr_bestiary_monsters is not the generated roster');
    for (const m of roster) {
      for (const s of X.ST.BESTIARY_STAGES) {
        const sqlFee = Number(await H.one(db, 'select public.hr_bestiary_fee_of($1, $2)', [s.stage, m.monster]));
        const jsFee = X.ST.stageFee(s.stage, X.MON.monsterLevelOf(X.MON.MONSTERS[m.monster]));
        if (sqlFee !== jsFee) p.push(`${m.monster} stage ${s.stage}: SQL fee ${sqlFee} vs data ${jsFee}`);
      }
    }
    return p;
  },

  'B-SHARED': async (db, { H, M }) => H.inTx(db, async () => {
    const p = [];
    const uid = H.UIDS[0];
    const h = await H.hunter(db, M, H.STRONG);
    await H.run(db, M, h.from, H.ticksOf(90000, 20 * 60000));
    await secondCharacter(H, db, uid);
    await killOp(H, db, uid, 1, 'rat', 7);
    const perChar = await H.q(db, `select slot, key, value from public.player_progress
      where user_id = $1 and kind = 'stat' and period_key = '' and key like 'ev:kill\\_monster:%' order by slot, key`, [uid]);
    const ratBySlot = (s) => Number((perChar.find((r) => r.slot === s && r.key === 'ev:kill_monster:rat') || {}).value || 0);
    if (!(ratBySlot(0) > 0)) p.push(`CONTROL: the real settle killed no rat on slot 0 (${JSON.stringify(perChar)})`);
    const acct = Number(await H.one(db, "select kills from public.account_bestiary where user_id = $1 and monster_id = 'rat'", [uid]));
    if (acct !== ratBySlot(0) + ratBySlot(1)) p.push(`the account counts ${acct} rats; its characters killed ${ratBySlot(0)} + ${ratBySlot(1)}`);
    if (perChar.some((r) => r.key === 'ev:kill_monster:wolf') && await H.one(db, "select count(*)::int from public.account_bestiary where user_id = $1 and monster_id = 'wolf'", [uid])) {
      p.push('a monster outside the bestiary catalogue (the fixture\'s wolf) was counted');
    }
    const s0 = await section(H, db, uid, 0);
    const s1 = await section(H, db, uid, 1);
    if (!s0 || JSON.stringify(s0) !== JSON.stringify(s1)) p.push('the two characters of one account read different bestiaries');
    if (!rowOf(s1, 'rat') || rowOf(s1, 'rat').kills !== acct) p.push(`the projection reads ${JSON.stringify(rowOf(s1, 'rat'))}`);
    /* Another account sees none of it. */
    await H.character(db, M, H.UIDS[1], {});
    const other = rowOf(await section(H, db, H.UIDS[1], 0), 'rat');
    if (!other || other.kills !== 0) p.push(`a second account reads ${JSON.stringify(other)}`);
    return p;
  }),

  'B-FEE': async (db, { H, M }) => H.inTx(db, async () => {
    const p = [];
    const uid = H.UIDS[2];
    await H.character(db, M, uid, { gold: 0 });
    await secondCharacter(H, db, uid);
    const act = (slot, stage, price, key = idem(), monster = 'rat') => asAuth(db, uid,
      'select public.hr_bestiary_activate($1, $2, $3, $4, $5::uuid)', [slot, monster, stage, price, key]);
    const fee1 = Number(await H.one(db, "select public.hr_bestiary_fee_of(1, 'rat')"));
    const gold = async (slot) => Number(await H.one(db, 'select gold from public.player_state where user_id = $1 and slot = $2', [uid, slot]));
    const ledger = async () => Number(await H.one(db, "select count(*)::int from public.player_ledger where user_id = $1 and intent like 'bestiary\\_stage:%'", [uid]));
    let r = await act(0, 1, fee1);
    if (r?.error !== 'no_relic') p.push(`a relic-less monster answered ${JSON.stringify(r)}`);
    await db.query("update public.hr_bestiary_monsters set has_relic = true where monster_id = 'rat'");
    await killOp(H, db, uid, 0, 'rat', 1000);
    await killOp(H, db, uid, 1, 'rat', 249);
    r = await act(0, 1, fee1);
    if (r?.error !== 'not_enough_kills' || r?.have !== 1249 || r?.need !== 1250) p.push(`1,249 kills answered ${JSON.stringify(r)}`);
    await killOp(H, db, uid, 1, 'rat', 1);
    r = await act(0, 1, fee1);
    if (r?.error !== 'insufficient_gold') p.push(`an empty purse answered ${JSON.stringify(r)}`);
    await db.query('update public.player_state set gold = 100000 where user_id = $1', [uid]);
    r = await act(0, 1, fee1 - 1);
    if (r?.error !== 'quote_changed') p.push(`a stale price answered ${JSON.stringify(r)}`);
    r = await act(0, 2, Number(await H.one(db, "select public.hr_bestiary_fee_of(2, 'rat')")));
    if (r?.error !== 'needs_previous_stage') p.push(`stage 2 before stage 1 answered ${JSON.stringify(r)}`);
    if (await gold(0) !== 100000 || await ledger() !== 0) p.push('a refused activation moved gold or journalled');
    const key = idem();
    r = await act(0, 1, fee1, key);
    if (r?.ok !== true || await gold(0) !== 100000 - fee1 || await ledger() !== 1) p.push(`the activation answered ${JSON.stringify(r)}; gold ${await gold(0)}, ledger ${await ledger()}`);
    const led = (await H.q(db, "select kind, gold, meta from public.player_ledger where user_id = $1 and intent = 'bestiary_stage:rat:1'", [uid]))[0];
    if (!led || led.kind !== 'shop' || Number(led.gold) !== -fee1 || led.meta?.monster !== 'rat' || led.meta?.stage !== 1) p.push(`the ledger row is ${JSON.stringify(led)}`);
    r = await act(0, 1, fee1, key);
    if (await gold(0) !== 100000 - fee1 || await ledger() !== 1) p.push(`a replay of the key charged again (${JSON.stringify(r)})`);
    r = await act(1, 1, fee1);
    if (r?.error !== 'already_active') p.push(`the other character re-buying stage 1 answered ${JSON.stringify(r)}`);
    const s1 = await section(H, db, uid, 1);
    if (rowOf(s1, 'rat')?.activated_stage !== 1 || s1?.relic_mult?.rat !== 1.05) p.push(`the other character reads ${JSON.stringify(rowOf(s1, 'rat'))} / ${JSON.stringify(s1?.relic_mult)}`);
    if (await gold(1) !== 100000) p.push('the activation took gold from the character that did not pay');
    /* No client role reaches the table, the readers or the count. */
    for (const sql of [`insert into public.account_bestiary (user_id, monster_id, kills, activated_stage) values ('${uid}', 'slime', 99999, 4)`,
      `update public.account_bestiary set activated_stage = 4 where user_id = '${uid}'`,
      'select * from public.account_bestiary', `select public.hr_bestiary_view('${uid}', 0)`, "select public.hr_bestiary_fee_of(1, 'rat')"]) {
      if (!(await refusedAsAuth(db, uid, sql))) p.push(`authenticated ran: ${sql}`);
    }
    return p;
  }),

  'B-IDEM': async (db, { H, S }) => {
    const bodies = async () => JSON.stringify((await db.query(`select p.oid::regprocedure::text as f, md5(p.prosrc) as h, coalesce(p.proacl::text, '') as acl
      from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows);
    const rows = async () => JSON.stringify([(await db.query('select key, fn, note from public.hr_state_sections order by key')).rows,
      (await db.query('select proname, identity_args, grantee, note from public.hr_client_rpc_baseline order by 1, 2, 3')).rows,
      (await db.query('select * from public.hr_bestiary_monsters order by 1, 2')).rows,
      (await db.query("select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.player_progress'::regclass order by 1")).rows]);
    const before = JSON.stringify([await S.inventory(db), await bodies(), await rows()]);
    for (const f of FILES) {
      try { await db.exec(readFileSync(join(S.ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n')); }
      catch (e) { return [`the second apply of ${f} RAISED: ${String(e.message).split('\n')[0]}`]; }
    }
    const after = JSON.stringify([await S.inventory(db), await bodies(), await rows()]);
    return before === after ? [] : ['a second apply of the 2026-10-28 bestiary files moved the schema, a body, a section, a baseline or a trigger'];
  },
};

// ═══════════════════════════════════════════════════════════════════════
async function runArms(root, db, ctx, only) {
  const X = await modules(root);
  const out = {};
  for (const [name, arm] of Object.entries(ENGINE_ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await arm(X); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
  }
  if (db) {
    for (const [name, arm] of Object.entries(DB_ARMS)) {
      if (only && !only.includes(name)) continue;
      try { out[name] = await arm(db, { ...ctx, X }); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')]; }
    }
  }
  return out;
}

/* JS mutants: planted in a temp copy of src/ + tools/. */
const MUTANTS = [
  { arm: 'B-DROPS', name: 'relicMult lifts every row, not only relic rows', file: 'src/core/drops.js',
    from: "const relic = row.tier === RELIC_TIER ? relicMultOf(m.relicMult) : 1;", to: 'const relic = relicMultOf(m.relicMult);' },
  { arm: 'B-DROPS', name: 'a forged relicMult is no longer clamped', file: 'src/core/drops.js',
    from: 'Math.min(v, MAX_RELIC_MULT)', to: 'v' },
  { arm: 'B-REWARDS', name: 'the kill roll never asks the member for its relicMult', file: 'src/core/hunt-rewards.js',
    from: "relicMult: typeof lead.relicMult === 'function' ? lead.relicMult(kind) : 1 }", to: 'relicMult: 1 }' },
  { arm: 'B-STAGES', name: 'stage 1 needs 1,200 kills', file: 'src/data/bestiary-stages.js',
    from: '{ stage: 1, kills: 1250,', to: '{ stage: 1, kills: 1200,' },
];
/* DB mutants: a function body re-defined in the booted chain, then restored. */
const DB_MUTANTS = [
  { arm: 'B-FEE', name: 'gold skips kills (the threshold check is gone)', fn: 'public.hr_bestiary_activate(integer,text,integer,bigint,uuid)',
    find: 'if v_kills < v_need then', replace: 'if false then' },
  { arm: 'B-FEE', name: 'any price is taken (the quote check is gone)', fn: 'public.hr_bestiary_activate(integer,text,integer,bigint,uuid)',
    find: 'if v_fee is null or v_fee <> p_price then', replace: 'if v_fee is null then' },
  { arm: 'B-FEE', name: 'a relic-less monster takes a fee', fn: 'public.hr_bestiary_activate(integer,text,integer,bigint,uuid)',
    find: 'm.monster_id = p_monster and m.has_relic', replace: 'm.monster_id = p_monster' },
  { arm: 'B-FEE', name: 'a stage can be bought twice', fn: 'public.hr_bestiary_activate(integer,text,integer,bigint,uuid)',
    find: 'if p_stage <= v_act then', replace: 'if false then' },
  { arm: 'B-SHARED', name: 'the count is per character again (only slot 0 adds)', fn: 'public.hr_bestiary_count()',
    find: 'if v_n is null or v_n <= 0 then', replace: 'if v_n is null or v_n <= 0 or new.slot <> 0 then' },
  { arm: 'B-DATA', name: 'the SQL fee drifts from the data', fn: 'public.hr_bestiary_fee_of(integer,text)',
    find: 'select s.fee_mult::bigint *', replace: 'select 1 + s.fee_mult::bigint *' },
];
/* SQL mutants: the file's own §6 must refuse it (a fresh chain per mutant). */
const SQL_MUTANTS = [
  { file: '2026-10-28-bestiary-account.sql', name: 'the counting trigger never fires',
    find: "for each row when (new.kind = 'stat' and", replace: "for each row when (new.kind = 'none' and" },
  { file: '2026-10-28-bestiary-account.sql', name: 'anon may activate',
    find: 'revoke execute on function public.hr_bestiary_activate(int, text, int, bigint, uuid) from anon, service_role;',
    replace: 'revoke execute on function public.hr_bestiary_activate(int, text, int, bigint, uuid) from service_role; grant execute on function public.hr_bestiary_activate(int, text, int, bigint, uuid) to anon;' },
];

async function main() {
  const S = await import('./schema-replay.mjs');
  const { HARNESS: H } = await import('./hunt-sessions-settle.mjs');
  let db;
  try { ({ db } = await S.bootReplay()); } catch (e) { console.error(`✗ the chain would not replay: ${String(e.message).slice(0, 600)}`); process.exit(1); }
  await H.pinDice(db);
  const ctx = { H, S, M: await H.loadEdge(S.ROOT) };
  if (MUTATE) {
    let bad = 0;
    for (const m of MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-bst-'));
      try {
        for (const d of ['src', 'tools', 'tests']) cpSync(join(S.ROOT, d), join(dir, d), { recursive: true });
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once`); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const res = await runArms(dir, null, ctx, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    for (const m of DB_MUTANTS) {
      const def = String(await H.one(db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error(`✗ db mutant "${m.name}": anchor not found exactly once`); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try {
        const res = await runArms(S.ROOT, db, ctx, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { await db.exec(def); }
    }
    for (const m of SQL_MUTANTS) {
      let refused = null;
      try { const r = await S.bootReplay({ patches: new Map([[m.file, [[m.find, m.replace]]]]), upTo: S.LAST_PATCHED }); await r.db.close(); }
      catch (e) { refused = String(e.message); }
      if (refused && !/patch anchor matched|produced identical SQL|did not land verbatim/.test(refused)) console.log(`✓ the §6 of ${m.file} refuses: ${m.name}`);
      else { console.error(`✗ ${m.file} applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    const total = MUTANTS.length + DB_MUTANTS.length + SQL_MUTANTS.length;
    console.log(bad ? `bestiary-account --mutate: ${bad} mutant(s) survived` : `bestiary-account --mutate: all ${total} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const res = await runArms(S.ROOT, db, ctx);
  let bad = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { bad++; for (const x of problems) console.error(`✗ ${name}: ${x}`); }
    else console.log(`✓ ${name}`);
  }
  console.log(bad ? `bestiary-account: ${bad} arm(s) red` : `bestiary-account: all ${Object.keys(res).length} arms green`);
  process.exit(bad ? 1 : 0);
}

if (isMain(import.meta.url)) main();
