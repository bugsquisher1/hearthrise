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
//   S1  SERVER: a hunt instance on the hunt's spawns (tests/hunt-fixture.mjs
//       huntAccrual) accrues, files a bestiary op per monster it fought (only
//       spawns, at least two), and is deterministic per seed
//   C1  the chain replays with both files and a SECOND apply is byte-identical
//   K1  SECURITY C3: a hunt row journals `km` (kills by monster, spawns only,
//       summing to `kills`)
//   RETIRED with the single-foe path (lane S1): W1/W2 (pickSpawn's weighted
//   draw — a hunt GROUND places its spawns, src/data/hunt-grounds.js), P1/R1
//   (the mixed single-foe span and the training seam — every fight is an
//   instance; split parity is hunt-sessions-settle TICK-1) and F1 (the fight
//   checkpoint — the world carries its units, hunt-sessions-settle VALUE
//   refuses a world of the wrong shape or swing).
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
import { huntRows, OUT_NAME as HUNTS_NOW } from '../tools/gen-hunts.mjs';
import * as ACCRUAL from '../supabase/functions/hr-accrue/accrual.js';
import { huntAccrual } from './hunt-fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');

/* ── THE SUBJECTS, injectable so --mutate can plant a defect in each ─────── */
const REAL = { huntRows };

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

  // S1 — the server engine.
  const hunt = HUNT_INDEX.mill_cellar;
  const NOW = Date.UTC(2026, 9, 20, 9, 0, 0); const FROM = NOW - 4 * 3600000;
  const skills = { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 };
  const srv = (over) => huntAccrual({
    userId: '00000000-0000-4000-8000-0000000c1a01', slot: 0, nowMs: NOW, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'mill_cellar', seed: 4242,
    hp: 99, maxHp: 99, gold: 0, skills, equipment: {}, items: ITEMS, monsters: MONSTERS, ...over,
  }, { seed: 4242 });
  const a1 = srv({}); const a2 = srv({});
  ok('S1', a1.accrued === true, `a hunt did not accrue: ${a1.reason}`);
  if (a1.accrued) {
    const bops = (a1.delta.progress || []).filter((p) => String(p.key).startsWith('ev:kill_monster:'));
    const ids = bops.map((p) => p.key.slice('ev:kill_monster:'.length));
    ok('S1', ids.length >= 2 && ids.every((m) => hunt.spawns.some((x) => x.monster === m)),
      `bestiary ops ${JSON.stringify(ids)} (want >= 2, spawns only)`);
    ok('S1', !ids.includes('mill_cellar'), 'the area id was filed as a bestiary row');
    ok('S1', JSON.stringify(a1.delta) === JSON.stringify(a2.delta), 'the same seed did not replay the same delta');
  }
  let unknown = false;
  try { srv({ activeId: 'not_a_hunt' }); } catch { unknown = true; }
  ok('S1', unknown, 'an unknown hunt id was fought');

  for (const r of serverArms(ACCRUAL)) red.push(r);

  // B1
  const gate = readFileSync(join(ROOT, 'supabase', 'migrations', '2026-10-20-hunts-start-gate.sql'), 'utf8');
  ok('B1', /'activity_locked'/.test(gate) && /hr_bounty_combat_level\(p_user, p_slot\)/.test(gate)
    && /GATE\(b\)/.test(gate) && /ridge_camp/.test(gate), 'the start gate lost its band refusal or its executed §4 arm');
  return red;
}

/* K1 / K2 / F1 — the server engine's hunt journal and its forged-fight guard.
   Injectable so --mutate can run them against a planted temp copy. */
function serverArms(engine) {
  const red = [];
  const ok = (id, cond, msg) => { if (!cond) red.push(`${id}: ${msg}`); };
  const hunt = HUNT_INDEX.mill_cellar;
  const NOW = Date.UTC(2026, 9, 20, 9, 0, 0); const FROM = NOW - 2 * 3600000;
  const skills = { attack: 200000, strength: 200000, defense: 200000, hitpoints: 200000 };
  const srv = (over) => huntAccrual({
    userId: '00000000-0000-4000-8000-0000000c1a02', slot: 0, nowMs: NOW, accruedToMs: FROM, activeSinceMs: FROM,
    activeKind: 'combat', activeId: 'mill_cellar', seed: 99,
    hp: 99, maxHp: 99, gold: 0, skills, equipment: {}, items: ITEMS, monsters: MONSTERS, ...over,
  }, { seed: 99, engine });
  // K1
  const h = srv({});
  const meta = h.accrued ? h.delta.journal.meta : {};
  const km = meta.km || {};
  const sum = Object.values(km).reduce((a, n) => a + n, 0);
  ok('K1', h.accrued && sum === meta.kills && sum > 0, `km ${JSON.stringify(km)} does not sum to kills ${meta.kills}`);
  ok('K1', Object.keys(km).length >= 2 && Object.keys(km).every((m) => hunt.spawns.some((sp) => sp.monster === m)),
    `km ${JSON.stringify(km)} — want >= 2 spawns, spawns only`);
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
  /* the CURRENT hunts catalogue (the earlier ones are applied history its forward file supersedes),
     then the gate, the rally pricing and the gate's chain-end restatements (the floor is a warning; the core
     rebuild reads the gate's skill levels on each skill's own curve, 2026-10-27-core-bodies.sql), and the party flow
     after it (2026-10-28-party-flow.sql drops the ground-less start core-bodies re-creates and restates its bodies) */
  for (const f of [HUNTS_NOW, '2026-10-20-hunts-start-gate.sql', '2026-10-20-hunts-rally-kills.sql', '2026-10-25-hunt-floor-warning.sql',
    '2026-10-27-core-bodies.sql', '2026-10-28-party-flow.sql', '2026-10-29-party-security.sql',
    '2026-10-28-hunt-enter-after-stamina.sql', '2026-10-30-party-invite-player.sql', '2026-10-30-town-activity-yields.sql']) {
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
  console.log('hunts-c1: G1 G2 S1 K1 B1 C1 green');
} else {
  const MUTANTS = {
    'generator admits unknown ids': { ...REAL, huntRows: () => [] },
  };
  let escaped = 0;
  {
    const { mkdtempSync, cpSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { pathToFileURL } = await import('node:url');
    const PLANTS = [
      { name: 'hunt row journals no km', arm: 'K1',
        file: 'supabase/functions/hr-accrue/accrual.js',
        from: '...(summary.kills > 0 ? { km: s.bestiary.counts() } : {}),', to: '' },
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
        const red = serverArms(A).filter((r) => r.startsWith(pl.arm));
        console.log(`  ${red.length ? 'caught ' : 'ESCAPED'} ${pl.name}${red.length ? ` (${pl.arm})` : ''}`);
        if (!red.length) escaped++;
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const control = serverArms(ACCRUAL);
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
