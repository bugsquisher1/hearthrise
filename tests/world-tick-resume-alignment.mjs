#!/usr/bin/env node
// ============================================================================
// tests/world-tick-resume-alignment.mjs — THE FIRST SWING AFTER A KNOCKOUT
// LANDS EXACTLY ON THE RECOVERY LINE. Attended and away, in a window and
// across one.
//
//   node tests/world-tick-resume-alignment.mjs           green
//   node tests/world-tick-resume-alignment.mjs --mutate  clean arm green, then
//                                                        every one-tick-off
//                                                        mutant RED by name
//
// Security, SEC_WORLD_TICK_PROBE_2026-10-05.md item (c): the probe bar cannot
// see a resume defect smaller than ~4 min per fall (tests/world-tick-probe-bar
// resumeMisalign), and ~0.9 falls/h x 4 min is ~6 % of combat time, inside the
// ±10 % band. So the resume is pinned DETERMINISTICALLY here, to the tick:
//
//   RA-0  a window that OPENS knocked out (the carried `recovering_until`, the
//         envelope's value) swings first at exactly that instant.
//   RA-1  a window that ends mid-recovery proposes
//         recovering_until = fall instant + the ladder's rung, exactly.
//   RA-2  inside ONE window, the first swing after the fall is at exactly R.
//   RA-3  across the window boundary (the shadow carrier, `advance`), the next
//         window's first swing is at exactly the R the previous one proposed.
//   RA-4  the shipped world-tick settler (settleCombatSession, 10 s cadence)
//         resumes at exactly R — the composition the 09-29 production
//         would_recovering_until rows measured.
//
// "Attended" is the settle that carries a live kill claim (inp.attended,
// caller 'accrue' — the 90 s live settle). "Away" is the world-tick caller.
// RA-4 is away-only: the tick REFUSES an attended claim (16.6).
//
// HOW "FIRST SWING AT R" IS OBSERVED, not computed. The engine is a prefix
// simulation on a fixed seed, so for a window opening at W:
//     [W, R−t]  →  [W, R]   adds one RECOVERY tick   (the tick at R−t is down)
//     [W, R]    →  [W, R+t] adds one SWING tick      (the tick at R swings)
// where t is the engine's own tickMs. A late resume fails the second step; an
// early one fails the first.
//
// No network, no database, no credential. Mutants run against a STAGED copy of
// src/core, src/data and supabase/functions/hr-accrue (Node cannot import a
// string), the tests/attended-fall.mjs shape.
// ============================================================================

import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { loadCombatSessions, atSpan } from '../services/world-tick/combat.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MUTATE = process.argv.includes('--mutate');
const FROM = Date.UTC(2026, 2, 14, 20, 0, 0);
const HOUR = 3600e3;

/* ── THE MUTANTS: each is ONE TICK OFF, and names the assertion that must
   catch it. Source mutants are applied to the staged copy; `seam` mutants are
   test-side carrier defects (a carrier that hands the next window a line one
   tick late is the tick-contract.js defect shape). */
const MUTANTS = {
  resumeOneTickLate: {
    why: 'the recovery gate keeps the character down ON the line (> becomes >=)',
    file: 'src/core/combat-sim.js',
    find: 'if (recoverUntilMs > atMs) {',
    repl: 'if (recoverUntilMs >= atMs) {',
    catches: 'RA-2',
  },
  stampOneTickEarly: {
    why: 'the line is stamped from the START of the dying swing, not its end',
    file: 'src/core/combat-sim.js',
    find: 'if (rec > 0) recoverUntilMs = atMs + tickMs + rec;',
    repl: 'if (rec > 0) recoverUntilMs = atMs + rec;',
    catches: 'RA-1',
  },
  carrierOneTickLate: {
    why: 'the carrier hands the next window a line one tick later than proposed',
    seam: 'carrierShiftTicks',
    shift: 1,
    catches: 'RA-3',
  },
};

async function engineAt(root) {
  const u = (p) => pathToFileURL(join(root, ...p.split('/'))).href;
  const acc = await import(u('supabase/functions/hr-accrue/accrual.js'));
  const shadow = await import(u('supabase/functions/hr-accrue/tick-shadow.js'));
  const env = await import(u('supabase/functions/hr-accrue/envelope.js'));
  const tc = await import(u('supabase/functions/hr-accrue/tick-combat.js'));
  const rng = await import(u('src/core/rng.js'));
  return { ...acc, ...shadow, ...env, ...tc, hashSeed: rng.hashSeed };
}

async function stage(m) {
  const dir = await mkdtemp(join(tmpdir(), 'hr-resume-align-'));
  for (const p of ['src/core', 'src/data', 'supabase/functions/hr-accrue']) {
    await cp(join(ROOT, ...p.split('/')), join(dir, ...p.split('/')), { recursive: true });
  }
  const f = join(dir, ...m.file.split('/'));
  const src = await readFile(f, 'utf8');
  const hits = src.split(m.find).length - 1;
  if (hits !== 1) throw new Error(`mutant anchor "${m.find}" found ${hits}x in ${m.file} — re-anchor the mutant`);
  await writeFile(f, src.replace(m.find, m.repl));
  return dir;
}

/* ── THE RUN: every assertion, against one engine ───────────────────────── */
function runAll(E, seam) {
  const fails = [];
  const passes = [];
  const ok = (id, cond, good, bad) => { if (cond) passes.push(`${id} — ${good}`); else fails.push({ id, msg: bad }); };
  const S = loadCombatSessions();
  const pick = (re) => {
    const s = S.find((x) => re.test(x.name));
    if (!s) throw new Error(`fixture ${re} is gone from combat-sessions.json`);
    return s;
  };

  const input = (c, fromMs, toMs, path, claimTo) => ({
    userId: c.userId, slot: c.slot, nowMs: toMs, accruedToMs: fromMs,
    activeSinceMs: c.activeSinceMs, activeKind: c.activeKind, activeId: c.activeId, capMs: c.capMs,
    seed: E.hashSeed(String(c.userId), String(c.slot), E.seedLabelFor(E.pgTimestamptzText(fromMs))),
    ...E.engineStateOf(c),
    bestiaryKills: c.bestiaryKills,
    items: E.COMBAT_CATALOGUES.items, monsters: E.COMBAT_CATALOGUES.monsters,
    attended: path === 'attended'
      ? { ok: true, kills: { [c.activeId]: 40 }, from: new Date(fromMs).toISOString(),
          to: new Date(claimTo || toMs).toISOString() }
      : null,
    caller: path === 'attended' ? 'accrue' : 'tick',
    callerAuthority: E.CALLER_AUTHORITY,
  });
  const run = (c, fromMs, toMs, path, claimTo) => {
    const r = E.computeAccrual(input(E.hydrate(c), fromMs, toMs, path, claimTo));
    if (!r || !r.accrued) throw new Error(`computeAccrual refused [${fromMs - FROM}, ${toMs - FROM}] (${r && r.reason})`);
    return r;
  };
  const sum = (r) => ({ ticks: Number(r.summary.ticks) || 0, rec: Number(r.summary.recoverMs) || 0 });

  /* First swing at exactly R, from a window opening at W on character c. */
  const swingsAt = (c, W, R, path, label, claimTo) => {
    const t0 = run(c, W, R + 60000, path, claimTo).tickMs;
    const t = t0;
    const a = sum(run(c, W, R - t, path, claimTo));
    const b = sum(run(c, W, R, path, claimTo));
    const d = sum(run(c, W, R + t, path, claimTo));
    const downBefore = b.ticks === a.ticks && b.rec === a.rec + t;
    const upAt = d.ticks === b.ticks + 1 && d.rec === b.rec;
    return { ok: downBefore && upAt, t,
      why: `${label}: [R−t,R) ${downBefore ? 'down' : `NOT down (ticks ${a.ticks}→${b.ticks}, rec ${a.rec}→${b.rec})`}`
        + `; [R,R+t) ${upAt ? 'swings' : `does NOT swing (ticks ${b.ticks}→${d.ticks}, rec ${b.rec}→${d.rec})`}` };
  };

  for (const path of ['away', 'attended']) {
    // ── RA-0 THE WINDOW OPENS KNOCKED OUT ────────────────────────────────
    {
      const c = atSpan(pick(/opens Knocked Out/), FROM);
      const R0 = Number(c.recoveringUntilMs);
      const s = swingsAt(c, FROM, R0, path, 'carried line');
      ok(`RA-0 ${path}`, R0 > FROM && s.ok,
        `a window opening down swings first at exactly the carried recovering_until (+${R0 - FROM} ms)`,
        `the first swing is not at the carried recovering_until — ${s.why}`);
    }

    for (const re of [/opens Knocked Out/, /seven falls deep/]) {
      const c = atSpan(pick(re), FROM);
      const tag = re.source.split(' ')[0];
      const full = run(c, FROM, FROM + 2 * HOUR, path);
      const t = full.tickMs;
      const fall = (full.summary.deathLog || []).find((d) => Number(d.recoverMs) > 0);
      if (!fall) { fails.push({ id: `RA-1 ${path}`, msg: `${tag}: the fixture no longer falls with a rung in 2 h — re-pick it` }); continue; }
      const rung = Number(fall.recoverMs);
      const Rx = fall.atMs + rung;

      // ── RA-1 the proposed line is fall + rung, exactly ─────────────────
      /* T: on the tick grid, mid-recovery, and leaving both windows ≥ the
         accrue path's 60 s floor (the attended settle is caller 'accrue'). */
      let k = 5;
      while (fall.atMs + k * t - FROM < 60000) k++;
      const T = fall.atMs + k * t;
      if (Rx - t - T < 60000) { fails.push({ id: `RA-1 ${path}`, msg: `${tag}: rung ${rung} leaves no 60 s window after T — re-pick the fall` }); continue; }
      const A = run(c, FROM, T, path, Rx + 60000);
      const R = Date.parse(A.delta.recovering_until);
      ok(`RA-1 ${path} ${tag}`, R === Rx,
        `a window ending mid-recovery proposes recovering_until = fall + ${rung / 60000} min, to the ms`,
        `recovering_until ${A.delta.recovering_until} is ${R - Rx} ms off fall (${fall.atMs - FROM}) + rung (${rung})`);

      // ── RA-2 in one window, the first swing is at R ────────────────────
      {
        const s = swingsAt(c, FROM, R, path, 'in-window', R + 60000);
        ok(`RA-2 ${path} ${tag}`, s.ok, 'in one window the first swing after the fall lands on R exactly',
          `in one window the resume is off the line — ${s.why}`);
      }

      // ── RA-3 across the boundary, through the carrier ───────────────────
      {
        const W = Date.parse(A.delta.accrued_to);
        const next = E.hydrate(c);
        E.advance(next, A);
        if (seam && seam.carrierShiftTicks) next.recoveringUntilMs += seam.carrierShiftTicks * t;
        const s = swingsAt(next, W, R, path, 'next window', R + 60000);
        ok(`RA-3 ${path} ${tag}`, W === T && s.ok,
          `the next window (opening ${(R - W) / 1000}s before R) swings first at exactly the carried R`,
          `across the window boundary the resume is off the carried line (watermark ${W - T} ms from T) — ${s.why}`);
      }

      // ── RA-4 the shipped settler, 10 s cadence (away only) ─────────────
      /* Every window that OPENS down (the previous window proposed a line
         past its watermark — would_recovering_until) and reaches that line.
         Its first swing is observed off the engine's own counts: with no fall
         in the window it is W + recoverMs (the recovery ticks lead); with one
         laddered fall it is fall − ticks·t (the swings run up to the dying
         one, the rest of the window is down). */
      if (path === 'away') {
        const st = E.settleCombatSession(E.hydrate(c), FROM, FROM + 3 * HOUR,
          { cadenceMs: 10000, flushMs: 90000, maxPolls: Infinity });
        let carried = Number(c.recoveringUntilMs) || 0;
        const seen = [];
        for (const w of st.results) {
          const r = w.res;
          if (!r.accrued) continue;
          const W = w.watermarkMs;
          const end = Date.parse(r.delta.accrued_to);
          const tk = r.tickMs;
          const log = r.summary.deathLog || [];
          if (carried > W && carried <= end && Number(r.summary.ticks) > 0
              && log.length <= 1 && log.every((d) => Number(d.recoverMs) > 0)) {
            const first = log.length
              ? log[0].atMs - Number(r.summary.ticks) * tk
              : W + Number(r.summary.recoverMs || 0);
            seen.push({ line: carried, off: first - carried });
          }
          if (typeof r.delta.recovering_until !== 'undefined') {
            carried = r.delta.recovering_until ? Date.parse(r.delta.recovering_until) : 0;
          }
        }
        const bad = seen.filter((s) => s.off !== 0);
        ok(`RA-4 ${tag}`, seen.length >= 1 && bad.length === 0,
          `the 10 s settler resumes on the carried line exactly, ${seen.length} of ${seen.length} resumes`,
          seen.length < 1 ? `no resume observed in 3 h — the fixture is vacuous here`
            : `${bad.length}/${seen.length} resumes off the carried line: `
              + bad.slice(0, 3).map((s) => `${s.off} ms at +${s.line - FROM}`).join(', '));
      }
    }
  }
  return { fails, passes };
}

async function main() {
  console.log('world-tick-resume-alignment: the first swing after a knockout lands on the recovery line');
  const clean = runAll(await engineAt(ROOT), null);
  for (const p of clean.passes) console.log(`  ✓ ${p}`);
  for (const f of clean.fails) console.log(`  ✗ ${f.id} — ${f.msg}`);
  if (clean.fails.length) {
    console.error(`\nworld-tick-resume-alignment: ${clean.fails.length} red`);
    process.exit(1);
  }
  if (!MUTATE) {
    console.log(`\nworld-tick-resume-alignment: green (${clean.passes.length} assertions).`
      + '\n   mutation proof: node tests/world-tick-resume-alignment.mjs --mutate');
    process.exit(0);
  }
  console.log('\n  mutants (each one tick off; each must go RED on the assertion it names)');
  let blind = 0;
  for (const [name, m] of Object.entries(MUTANTS)) {
    let dir = null;
    let res;
    try {
      if (m.file) { dir = await stage(m); res = runAll(await engineAt(dir), null); }
      else res = runAll(await engineAt(ROOT), { [m.seam]: m.shift });
    } finally {
      if (dir) await rm(dir, { recursive: true, force: true });
    }
    const hit = res.fails.filter((f) => f.id.startsWith(m.catches));
    if (hit.length) console.log(`  ✓ --${name} RED on ${hit[0].id} (${hit.length} arm(s)): ${hit[0].msg}`);
    else { console.log(`  ✗ --${name} (${m.why}) did not turn ${m.catches} red — the invariant is blind to it`); blind++; }
  }
  if (blind) {
    console.error(`\nworld-tick-resume-alignment --mutate: ${blind} blind mutant(s)`);
    process.exit(1);
  }
  console.log('\nworld-tick-resume-alignment --mutate: every one-tick-off mutant RED, as required.');
  process.exit(0);
}

await main();
