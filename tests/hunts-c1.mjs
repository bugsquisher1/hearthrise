#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunts-c1.mjs — HUNTS AS NAMED AREAS (lane C1).
//
//   node tests/hunts-c1.mjs            the guard
//   node tests/hunts-c1.mjs --mutate   every planted defect must be CAUGHT
//
// ARMS
//   G1  the generated catalogue matches src/data/hunts.js (gen-hunts --check)
//   G2  the generator REFUSES an unknown monster id (and the other shapes)
//   W1  weighted pick over N=120,000 lands within 1 percentage point of w/Σw
//   W2  a one-spawn hunt draws NOTHING from the rng (training stays byte-identical)
//   P1  THE MIX, ON A HUNT SESSION (lane C2: a fight is a session, one engine
//       whether watched or not — its split-settle parity is
//       hunt-sessions-settle TICK-1): a mixed hunt fights more than one
//       spawn, spawns only, and the same seed replays identically
//   S1  SERVER: computeAccrual on a hunt session accrues, files a bestiary op
//       per monster it fought (only spawns), carries the fight on a spawn, and
//       is deterministic per seed (S2, the attended top-up, left with it)
//   R1  REGRESSION: a training fight (monster pointer) prices byte-identically
//       with and without the hunt seam (no `hunt` in ctx, no extra draw)
//   C1  the chain replays with both files and a SECOND apply is byte-identical
//   K1  SECURITY C3: a hunt row journals `km` (kills by monster, spawns only,
//       summing to `kills`); a training row carries none
//   F1  a FORGED fight checkpoint on a non-spawn is never resumed on a hunt
//   X1  --mutate only: the C2 spawn gate and the C3 rally pricing, each
//       removed from its migration, make that file's executed §4 raise
//   B1  the band floor is SQL's: the start-gate migration refuses below band
//       (executed by its own §4 in the chain replay — asserted present here)
// ════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUNTS, HUNT_INDEX } from '../src/data/hunts.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { pickSpawn } from '../src/core/hunt-spawn.js';
import { simulateSpan } from '../src/core/combat-sim.js';
import { COMBAT_BALANCE } from '../src/core/combat.js';
import { createRng } from '../src/core/rng.js';
import { huntRows } from '../tools/gen-hunts.mjs';
import { computeAccrual } from '../supabase/functions/hr-accrue/accrual.js';
import { huntOn, huntAccrualInput } from './hunt-fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');

/* ── THE SUBJECTS, injectable so --mutate can plant a defect in each ─────── */
const REAL = { pickSpawn, huntRows };

function run(S) {
  const red = [];
  const ok = (id, cond, msg) => { if (!cond) red.push(`${id}: ${msg}`); };

  // G1
  const chk = spawnSync(process.execPath, [join(ROOT, 'tools', 'gen-hunts.mjs'), '--check'], { encoding: 'utf8' });
  ok('G1', chk.status === 0, `gen-hunts --check exited ${chk.status}: ${chk.stderr}`);

  // G2
  const bad = HUNTS.map((h) => ({ ...h, spawns: h.spawns.map((s) => ({ ...s })) }));
  bad[0].spawns[0].monster = 'definitely_not_a_monster';
  let refused = false;
  try { S.huntRows(bad, MONSTERS); } catch { refused = true; }
  ok('G2', refused, 'the generator accepted an unknown monster id');
  let shipped = true;
  try { S.huntRows(HUNTS, MONSTERS); } catch (e) { shipped = false; ok('G2', false, `shipped data refused: ${e.message}`); }
  ok('G2', shipped, 'CONTROL');

  // W1
  const N = 120000;
  for (const h of HUNTS) {
    const rng = createRng(1234);
    const got = Object.create(null);
    for (let i = 0; i < N; i++) { const m = S.pickSpawn(h.spawns, rng); got[m] = (got[m] || 0) + 1; }
    const tot = h.spawns.reduce((a, s) => a + s.w, 0);
    for (const s of h.spawns) {
      const p = (got[s.monster] || 0) / N;
      ok('W1', Math.abs(p - s.w / tot) < 0.01, `${h.id}/${s.monster}: ${p.toFixed(4)} vs ${(s.w / tot).toFixed(4)}`);
    }
    ok('W1', Object.keys(got).every((m) => h.spawns.some((s) => s.monster === m)), `${h.id} picked a non-spawn`);
  }

  // W2
  let draws = 0;
  const counting = { int() { draws++; return 1; }, next() { draws++; return 0; }, chance() { draws++; return false; } };
  ok('W2', S.pickSpawn([{ monster: 'rat', w: 7 }], counting) === 'rat' && draws === 0,
    `a one-spawn pick drew ${draws} time(s)`);

  // P1 — the mix, on a hunt session, one seed.
  const hunt = HUNT_INDEX.mill_cellar;
  const TICK = COMBAT_BALANCE.tickMs; const TICKS = 3000;
  const fresh = () => ({ activeMonster: hunt.spawns[0].monster, monsterHp: 0, monsterMaxHp: 0,
    playerHp: 400, playerMaxHp: 400, gold: 0, stats: {}, skills: {} });
  const T0 = Date.UTC(2026, 9, 20, 1, 0, 0);
  const ctxFor = (tally, withHunt = true) => ({
    fromMs: T0, toMs: T0 + TICKS * TICK,
    tickMs: TICK, monsters: MONSTERS, items: ITEMS, ...(withHunt ? { hunt } : {}),
    bonus: () => 0, style: null,
    playerRolls: () => ({ accuracy: 0.9, maxHit: 6, critChance: 0.05 }),
    monsterRolls: () => ({ accuracy: 0, maxHit: 0 }),   // no deaths
    weakness: () => ({ dropMult: 1 }),
    fx: {
      addItem(id, q) { tally.items[id] = (tally.items[id] || 0) + q; },
      addXp(sk, a) { tally.xp[sk] = (tally.xp[sk] || 0) + a; },
      recordKill(id) { tally.kills[id] = (tally.kills[id] || 0) + 1; },
    },
  });
  const spanOf = (seed, mk = fresh, withHunt = true) => {
    const t = { items: {}, xp: {}, kills: {} }; const st = mk(); const c = ctxFor(t, withHunt);
    huntOn(st, c, { seed, fromMs: T0, pull: { size: 1, respawnMs: 0 } });
    const sum = simulateSpan(st, c);
    return { t, st, sum };
  };
  const pA = spanOf(77); const pB = spanOf(77);
  const norm = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]]));
  ok('P1', norm(pA.t.kills) === norm(pB.t.kills) && pA.st.gold === pB.st.gold && norm(pA.t.xp) === norm(pB.t.xp)
    && norm(pA.t.items) === norm(pB.t.items), 'the same seed did not replay the same hunt span');
  ok('P1', Object.keys(pA.t.kills).length >= 2 && pA.sum.kills > 50,
    `the mixed hunt fought ${JSON.stringify(pA.t.kills)} (${pA.sum.kills} kills) — not a mix`);
  ok('P1', Object.keys(pA.t.kills).every((m) => hunt.spawns.some((s) => s.monster === m)), 'a non-spawn was fought');

  // S1 — the server engine, AWAY.
  const NOW = Date.UTC(2026, 9, 20, 9, 0, 0); const FROM = NOW - 4 * 3600000;
  const skills = { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 };
  const srv = (over) => computeAccrual(huntAccrualInput({
    userId: '00000000-0000-4000-8000-0000000c1a01', slot: 0, nowMs: NOW, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'mill_cellar', capMs: 12 * 3600000, seed: 4242,
    hp: 99, maxHp: 99, gold: 0, skills, equipment: {}, items: ITEMS, monsters: MONSTERS, fight: {}, ...over,
  }, { seed: 4242 }));
  const a1 = srv({}); const a2 = srv({});
  ok('S1', a1.accrued === true, `a hunt pointer did not accrue: ${a1.reason}`);
  if (a1.accrued) {
    const bops = (a1.delta.progress || []).filter((p) => String(p.key).startsWith('ev:kill_monster:'));
    const ids = bops.map((p) => p.key.slice('ev:kill_monster:'.length));
    ok('S1', ids.length >= 2 && ids.every((m) => hunt.spawns.some((s) => s.monster === m)),
      `bestiary ops ${JSON.stringify(ids)} (want >= 2, spawns only)`);
    ok('S1', !ids.includes('mill_cellar'), 'the area id was filed as a bestiary row');
    ok('S1', !a1.delta.fight || !a1.delta.fight.monster || hunt.spawns.some((s) => s.monster === a1.delta.fight.monster),
      `fight carried on a non-spawn ${JSON.stringify(a1.delta.fight)}`);
    ok('S1', JSON.stringify(a1.delta) === JSON.stringify(a2.delta), 'the same seed did not replay the same delta');
    ok('S1', a1.huntKills && Object.keys(a1.huntKills).length >= 2, `huntKills ${JSON.stringify(a1.huntKills)}`);
  }
  const unk = srv({ activeId: 'not_a_hunt' });
  ok('S1', unk.accrued === false, 'an unknown combat pointer accrued');

  // R1 — training is unchanged by the seam.
  const t1 = srv({ activeId: 'rat' });
  ok('R1', t1.accrued === true && t1.huntKills === undefined, 'a training window grew a huntKills key');
  {
    const rat = () => Object.assign(fresh(), { activeMonster: 'rat' });
    const plain = spanOf(5, rat, false);
    const t2 = { items: {}, xp: {}, kills: {} }; const s2 = rat(); const c2 = ctxFor(t2, false);
    c2.hunt = { spawns: [{ monster: 'rat', w: 1 }] };
    huntOn(s2, c2, { seed: 5, fromMs: T0, pull: { size: 1, respawnMs: 0 } });
    simulateSpan(s2, c2);
    ok('R1', JSON.stringify([plain.st.gold, plain.t]) === JSON.stringify([s2.gold, t2]) && Object.keys(plain.t.kills).join() === 'rat',
      'a one-spawn hunt priced differently from the plain training fight');
  }

  for (const r of serverArms(computeAccrual)) red.push(r);

  // B1
  const gate = readFileSync(join(ROOT, 'supabase', 'migrations', '2026-10-20-hunts-start-gate.sql'), 'utf8');
  ok('B1', /'activity_locked'/.test(gate) && /hr_bounty_combat_level\(p_user, p_slot\)/.test(gate)
    && /GATE\(b\)/.test(gate) && /ridge_camp/.test(gate), 'the start gate lost its band refusal or its executed §4 arm');
  return red;
}

/* K1 / K2 / F1 — the server engine's hunt journal and its forged-fight guard.
   Injectable so --mutate can run them against a planted temp copy. */
function serverArms(CA) {
  const red = [];
  const ok = (id, cond, msg) => { if (!cond) red.push(`${id}: ${msg}`); };
  const hunt = HUNT_INDEX.mill_cellar;
  const NOW = Date.UTC(2026, 9, 20, 9, 0, 0); const FROM = NOW - 2 * 3600000;
  const skills = { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 };
  const srv = (over) => CA(huntAccrualInput({
    userId: '00000000-0000-4000-8000-0000000c1a02', slot: 0, nowMs: NOW, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'mill_cellar', capMs: 12 * 3600000, seed: 99,
    hp: 99, maxHp: 99, gold: 0, skills, equipment: {}, items: ITEMS, monsters: MONSTERS, fight: {}, ...over,
  }, { seed: 99 }));
  // K1
  const h = srv({});
  const meta = h.accrued ? h.delta.journal.meta : {};
  const km = meta.km || {};
  const sum = Object.values(km).reduce((a, n) => a + n, 0);
  ok('K1', h.accrued && sum === meta.kills && sum > 0, `km ${JSON.stringify(km)} does not sum to kills ${meta.kills}`);
  ok('K1', Object.keys(km).length >= 2 && Object.keys(km).every((m) => hunt.spawns.some((sp) => sp.monster === m)),
    `km ${JSON.stringify(km)} — want >= 2 spawns, spawns only`);
  const t = srv({ activeId: 'rat' });
  ok('K1', t.accrued && !('km' in t.delta.journal.meta), 'a training row carries km');
  // F1 — a goblin checkpoint at 1 HP on a hunt that has no goblins.
  const forged = srv({ fight: { monster: 'goblin', hp: 1, kills: 0 } });
  const fk = forged.accrued ? (forged.delta.journal.meta.km || {}) : {};
  ok('F1', forged.accrued && !('goblin' in fk)
    && !(forged.delta.progress || []).some((op) => op.key === 'ev:kill_monster:goblin'),
    `a forged non-spawn checkpoint was fought: km ${JSON.stringify(fk)}`);
  return red;
}

/* X1 — each Security change, removed from its migration, makes THAT file's
   executed §4 raise in the chain replay (scoped upTo the file). */
async function sqlMutants() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const M = [
    { name: 'C2 spawn gate removed from hr_hunt_gate', file: '2026-10-20-hunts-start-gate.sql', want: 'GATE(d2)',
      from: '       and (a.is_boss\n', to: '       and (false\n',
      also: ['                and coalesce((select public.hr_level_from_xp(ps.xp) from public.player_skills ps\n',
             '                and false and coalesce((select public.hr_level_from_xp(ps.xp) from public.player_skills ps\n'] },
    { name: 'C3 rally ignores km', file: '2026-10-20-hunts-rally-kills.sql', want: 'GATE(case 1)',
      from: '                  * (case when k.km_kills is not null\n', to: '                  * (case when false\n' },
  ];
  let escaped = 0;
  for (const m of M) {
    const pairs = [[m.from, m.to]];
    if (m.also) pairs.push(m.also);
    let raised = null;
    try { const { db } = await bootReplay({ patches: new Map([[m.file, pairs]]), upTo: m.file }); await db.close?.(); } catch (e) { const msg = String(e.message); raised = msg.includes(m.want) ? m.want : null; }
    console.log(`  ${raised ? 'caught ' : 'ESCAPED'} ${m.name}${raised ? ` (${raised.slice(0, 90)})` : ''}`);
    if (!raised) escaped++;
  }
  return escaped;
}

/* C1 — THE CHAIN: both files replay, and a SECOND apply of each is
   byte-identical (schema inventory, hr_apply / hr_hunt_gate bodies + ACLs,
   catalogue rows). The §4 block of the gate (band refusal, unknown area,
   spawn-aware void, training unchanged, floor opens at 15) EXECUTES in it. */
async function chainArm() {
  const red = [];
  const { bootReplay, inventory } = await import('./schema-replay.mjs');
  const { db } = await bootReplay({});
  const q = async (sql) => (await db.query(sql)).rows;
  const snap = async () => JSON.stringify([await inventory(db),
    await q(`select p.proname, md5(p.prosrc) h, p.proacl::text acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname in ('hr_apply', 'hr_hunt_gate', 'hr_rally_points_of') order by 1`),
    await q('select * from public.hr_hunts order by 1'), await q('select * from public.hr_hunt_spawns order by 1, 2')]);
  const before = await snap();
  for (const f of ['2026-10-20-hunts-catalogue.generated.sql', '2026-10-20-hunts-start-gate.sql', '2026-10-20-hunts-rally-kills.sql']) {
    try { await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8')); } catch (e) {
      red.push(`C1: a second apply of ${f} raised: ${String(e.message).split(String.fromCharCode(10))[0]}`);
    }
  }
  const after = await snap();
  if (before !== after) {
    const B = JSON.parse(before); const A = JSON.parse(after);
    const which = ['inventory', 'bodies', 'hr_hunts', 'hr_hunt_spawns'].filter((_, i) => JSON.stringify(B[i]) !== JSON.stringify(A[i]));
    let detail = '';
    if (which[0] === 'inventory') {
      for (const k of Object.keys(B[0])) if (JSON.stringify(B[0][k]) !== JSON.stringify(A[0][k])) detail += ` ${k}`;
    }
    if (which.includes('bodies')) detail += ` ${JSON.stringify(B[1])} -> ${JSON.stringify(A[1])}`;
    red.push(`C1: a second apply changed ${which.join(', ')}${detail}`);
  }
  await db.close?.();
  return red;
}

if (!MUTATE) {
  const red = [...run(REAL), ...(await chainArm())];
  if (red.length) { console.error('hunts-c1 RED\n  ' + red.join('\n  ')); process.exit(1); }
  console.log('hunts-c1: G1 G2 W1 W2 P1 S1 R1 K1 F1 B1 C1 green');
} else {
  const MUTANTS = {
    'uniform pick (ignores weights)': { ...REAL, pickSpawn: (sp, rng) => (sp.length === 1 ? sp[0].monster : sp[rng.int(0, sp.length - 1)].monster) },
    'one-spawn draws': { ...REAL, pickSpawn: (sp, rng) => { rng.int(1, 2); return REAL.pickSpawn(sp, rng); } },
    'generator admits unknown ids': { ...REAL, huntRows: () => [] },
  };
  let escaped = 0;
  /* THE ENGINE PLANT: a copy of src/ in the OS temp dir whose resolveKill
     ignores ctx.hunt. P1's "a mix was fought" must go red on it. Never the tree. */
  {
    const { mkdtempSync, cpSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const dir = mkdtempSync(join(tmpdir(), 'hunts-c1-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
      const f = join(dir, 'src', 'core', 'combat-sim.js');
      const src = readFileSync(f, 'utf8');
      const anchor = 'const nextId = (ctx.hunt && ctx.hunt.spawns) ? pickSpawn(ctx.hunt.spawns, rng) : id;';
      if (src.split(anchor).length !== 2) throw new Error('engine plant anchor moved');
      writeFileSync(f, src.replace(anchor, 'const nextId = id;'));
      const E = await import(pathToFileURL(f).href);
      const t = { items: {}, xp: {}, kills: {} };
      const st = { activeMonster: 'rat', monsterHp: 0, monsterMaxHp: 0, playerHp: 400, playerMaxHp: 400, gold: 0, stats: {}, skills: {} };
      const ctx = { fromMs: 0, toMs: COMBAT_BALANCE.tickMs * 500, tickMs: COMBAT_BALANCE.tickMs, monsters: MONSTERS,
        hunt: HUNT_INDEX.mill_cellar, bonus: () => 0, playerRolls: () => ({ accuracy: 0.9, maxHit: 6, critChance: 0 }),
        monsterRolls: () => ({ accuracy: 0, maxHit: 0 }), weakness: () => ({ dropMult: 1 }),
        fx: { recordKill(id) { t.kills[id] = (t.kills[id] || 0) + 1; } } };
      huntOn(st, ctx, { seed: 77, fromMs: 0, pull: { size: 1, respawnMs: 0 } });
      E.simulateSpan(st, ctx);
      const caught = Object.keys(t.kills).length < 2;
      console.log(`  ${caught ? 'caught ' : 'ESCAPED'} engine ignores ctx.hunt (P1 mix)`);
      if (!caught) escaped++;
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  {
    const { mkdtempSync, cpSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const PLANTS = [
      { name: 'forged non-spawn checkpoint resumed (huntSpawns bypassed)', arm: 'F1',
        file: 'supabase/functions/hr-accrue/accrual.js',
        from: '(fight0 && huntSpawns(hunt, fight0.monster)) ? fight0.monster', to: '(fight0 && fight0.monster) ? fight0.monster' },
      { name: 'hunt row journals no km', arm: 'K1',
        file: 'supabase/functions/hr-accrue/accrual.js',
        from: '...(hunt && summary.kills > 0 ? { km: bestiary.counts() } : {}),', to: '' },
    ];
    for (const pl of PLANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hunts-c1-'));
      try {
        cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
        cpSync(join(ROOT, 'supabase', 'functions', 'hr-accrue'), join(dir, 'supabase', 'functions', 'hr-accrue'), { recursive: true });
        const f = join(dir, pl.file);
        const src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(pl.from).length !== 2) throw new Error(`plant anchor moved: ${pl.name}`);
        writeFileSync(f, src.replace(pl.from, pl.to));
        const A = await import(pathToFileURL(join(dir, 'supabase/functions/hr-accrue/accrual.js')).href);
        const red = serverArms(A.computeAccrual).filter((r) => r.startsWith(pl.arm));
        console.log(`  ${red.length ? 'caught ' : 'ESCAPED'} ${pl.name}${red.length ? ` (${pl.arm})` : ''}`);
        if (!red.length) escaped++;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const control = serverArms(computeAccrual);
    if (control.length) { console.log(`  CONTROL RED: ${control[0]}`); escaped++; }
  }
  escaped += await sqlMutants();
  for (const [name, S] of Object.entries(MUTANTS)) {
    const red = run(S);
    console.log(`  ${red.length ? 'caught ' : 'ESCAPED'} ${name}${red.length ? ` (${red[0].split(':')[0]})` : ''}`);
    if (!red.length) escaped++;
  }
  if (escaped) { console.error(`hunts-c1 --mutate: ${escaped} mutant(s) escaped`); process.exit(1); }
  console.log('hunts-c1 --mutate: every mutant caught');
}
