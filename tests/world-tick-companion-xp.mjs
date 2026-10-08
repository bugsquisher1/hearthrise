// ============================================================================
// tests/world-tick-companion-xp.mjs — A TICK CHAIN CREDITS THE PET WHAT ONE SPAN DOES
//
//   node tests/world-tick-companion-xp.mjs            green = tick chain == one accrue span
//   node tests/world-tick-companion-xp.mjs --mutate   each half of the fix reverted in a copy: its arm goes red
//
// THE FINDING (Security, 2026-10-08, pre-existing underpay). tick-shadow.js
// handed `computeAccrual` `companionXpBacked: char.companionXpBacked`, and no
// session builder ever set that field — it is a DEPLOY CONSTANT
// (COMPANION_XP_SERVER_BACKED) that index.ts and set-activity.js thread, not a
// character value. So on every tick window `companionXpOps` returned [], while
// the watermark advanced past the actions: an armed character's pet XP for the
// window was gone for good. C1 (world-tick-combat-parity) compares key NAMES
// and the name was there; its own reference builder copied `c.companionXpBacked`
// too, so it agreed with the defect.
//
//   R1  gather regression: the SHIPPED gather chain (settleGatherSession, 10 s
//       cadence, 90 s flushes) over 30 min with a dedicated gather pet
//       credits `companion_xp:<id>` exactly 1 xp per engine action, as one
//       accrue span of the same window does, and the two action counts agree
//       within 2% (seeded secondary rolls; a chain draws a stream per window).
//   R2  combat: the SHIPPED combat chain credits the pet exactly the kills the
//       chain itself filed (a dedicated combat pet earns 1/kill), and > 0. The
//       one span is held to the same rule over its own kills (seeded rolls
//       differ between a chain and a span, so kills are compared to kills).
//   P1  parity arm, the cap: a pet 7 XP under COMPANION_XP_CAP. One span
//       credits 7; the chain must credit 7 too, not 7 per window — which only
//       holds if advance() carries each window's credit into the next
//       window's clamp.
//
// UTILITY PETS (0.5/action) are MEASURED here, on sessions WITHOUT a projected
// remainder (a database before 2026-10-12-companion-xp-frac.sql): floored per
// window, a 10 s window holding one action credits 0. The carried remainder that
// closes it is asserted in tests/companion-xp-frac.mjs (C2: the Fox on mithril).
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, writeFile, cp, mkdtemp } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');

const BACKED_LINE = '    companionXpBacked: COMPANION_XP_SERVER_BACKED,\n';
const CARRY_LINE = "  if (comp && typeof comp.id === 'string' && Array.isArray(d.progress)) {\n";
const MUTANTS = [
  { name: 'the tick drops the arm-switch hydration (the shipped defect)', arms: ['R1', 'R2', 'P1'],
    edits: [['supabase/functions/hr-accrue/tick-shadow.js', BACKED_LINE,
      '    companionXpBacked: char.companionXpBacked,\n']] },
  { name: 'advance() stops carrying the credited XP into the next clamp', arms: ['P1'],
    edits: [['supabase/functions/hr-accrue/tick-shadow.js', CARRY_LINE,
      "  if (false && comp && typeof comp.id === 'string' && Array.isArray(d.progress)) {\n"]] },
];

async function load(base) {
  const at = (p) => import(pathToFileURL(join(base, p)).href);
  const [acc, gather, combat, env, cxp] = await Promise.all([
    at('supabase/functions/hr-accrue/accrual.js'),
    at('supabase/functions/hr-accrue/tick-gather.js'),
    at('supabase/functions/hr-accrue/tick-combat.js'),
    at('supabase/functions/hr-accrue/envelope.js'),
    at('src/core/companion-xp.js'),
  ]);
  return { acc, gather, combat, env, cxp };
}

async function copyWith(edits) {
  const base = await mkdtemp(join(tmpdir(), 'hr-wtcx-'));
  await cp(join(ROOT, 'supabase', 'functions'), join(base, 'supabase', 'functions'), { recursive: true });
  await cp(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
  for (const [rel, find, repl] of edits) {
    const p = join(base, rel);
    const src = await readFile(p, 'utf8');
    if (!src.includes(find)) {
      console.error(`--mutate: marker gone from ${rel}: ${JSON.stringify(find)} — the mutant cannot be applied`);
      process.exit(2);
    }
    await writeFile(p, src.replace(find, repl), 'utf8');
  }
  return base;
}

const T0 = Date.parse('2026-10-08T12:00:00.000Z');
const SPAN_MS = 30 * 60 * 1000;
const GEOM = { cadenceMs: 10000, flushMs: 90000 };

const actionsOf = (results) => results.reduce((n, r) =>
  n + Number((r.res && r.res.accrued && r.res.companionActions) || 0), 0);

const companionAdd = (deltas, id) => {
  let n = 0;
  for (const d of deltas) for (const op of (d && d.progress) || []) {
    if (op.kind === 'stat' && op.key === 'companion_xp:' + id) n += Number(op.add) || 0;
  }
  return n;
};

function gatherSession(pet, xp) {
  return {
    userId: '00000000-0000-4000-8000-00000000c0a1', slot: 0, shard: 0, version: 1,
    activeKind: 'gather', activeId: 'normal_tree', activeSinceMs: T0, accruedToMs: T0,
    capMs: 43200000, hp: 40, maxHp: 40, gold: 0,
    skills: { woodcutting: 500, hitpoints: 1200 }, inventory: {}, equipment: {}, toolCarry: null,
    perks: { ok: true, companion: { id: pet, xp } },
  };
}

function combatSession(M, pet, xp) {
  const s = {
    userId: '00000000-0000-4000-8000-00000000c0a2', slot: 0, shard: 0, version: 1,
    activeKind: 'combat', activeId: 'goblin', activeSinceMs: T0, accruedToMs: T0,
    accruedToText: M.combat.pgTimestamptzText(T0),
    capMs: 43200000, hp: 99, maxHp: 99, gold: 0,
    skills: { attack: 1300000, strength: 1300000, defence: 1300000, hitpoints: 1300000 },
    inventory: {}, equipment: {},
    perks: { ok: true, companion: { id: pet, xp } },
  };
  return s;
}

/* index.ts's literal over one span — the accrue path. The arm switch is the
   SAME imported constant index.ts threads, never a fixture value. */
function accrueSpan(M, s, fromMs, toMs, catalogues, seed) {
  return M.acc.computeAccrual({
    ...M.env.engineStateOf(s),
    userId: s.userId, slot: s.slot, nowMs: toMs, accruedToMs: fromMs,
    activeSinceMs: s.activeSinceMs, activeKind: s.activeKind, activeId: s.activeId,
    capMs: s.capMs, seed, bestiaryKills: null, perks: s.perks,
    companionXpBacked: M.cxp.COMPANION_XP_SERVER_BACKED,
    unlockedRecipes: null, actionBudget: null, attended: null,
    items: catalogues.items, monsters: catalogues.monsters, nodes: catalogues.nodes,
    caller: 'accrue', callerAuthority: M.acc.CALLER_AUTHORITY,
  });
}

function run(M, log) {
  const red = new Set();
  const judge = (id, ok, okMsg, badMsg) => {
    if (ok) log(`  ✓ ${id} — ${okMsg}`); else { red.add(id); log(`  ✗ ${id} — ${badMsg}`); }
  };
  const GC = M.gather.GATHER_CATALOGUES;
  const CC = M.combat.COMBAT_CATALOGUES;

  // R1 — gather: the chain credits exactly what the accrue engine owes for the
  // same actions. The comparison is per ACTION, not per total: the basis is the
  // count of yield addItem calls, which includes seeded secondary rolls, and a
  // chain draws one stream per window where a span draws one — so the totals
  // may differ by a roll while each path must still pay 1 xp per action.
  {
    const s = gatherSession('sparrow', 0);
    const chain = M.gather.settleGatherSession(s, T0, T0 + SPAN_MS, GEOM);
    const tickXp = companionAdd(chain.intents.map((i) => i.args.p_delta), 'sparrow');
    const acts = actionsOf(chain.results);
    const span = accrueSpan(M, s, T0, chain.watermarkMs, GC, 1);
    const spanXp = span.accrued ? companionAdd([span.delta], 'sparrow') : 0;
    const spanActs = Number(span.companionActions || 0);
    judge('R1', acts > 0 && tickXp === acts && spanXp === spanActs && Math.abs(acts - spanActs) <= Math.ceil(spanActs * 0.02),
      `gather chain credits the Sparrow ${tickXp} xp for ${acts} actions; one accrue span ${spanXp} for ${spanActs}`,
      `gather chain credits the Sparrow ${tickXp} xp for ${acts} actions (span: ${spanXp} for ${spanActs})`);
  }

  // R2 — combat: the chain credits its own kills, dedicated pet.
  {
    const s = combatSession(M, 'wolf_pup', 0);
    const chain = M.combat.settleCombatSession(s, T0, T0 + SPAN_MS, GEOM);
    const deltas = chain.intents.map((i) => i.args.p_delta);
    const tickXp = companionAdd(deltas, 'wolf_pup');
    const kills = chain.results.reduce((n, r) => n + Number((r.res && r.res.accrued && r.res.summary && r.res.summary.kills) || 0), 0);
    const span = accrueSpan(M, s, T0, T0 + SPAN_MS, CC, 1);
    const spanXp = span.accrued ? companionAdd([span.delta], 'wolf_pup') : 0;
    const spanKills = Number((span.summary && span.summary.kills) || 0);
    judge('R2', kills > 0 && tickXp === kills && spanXp === spanKills,
      `combat chain credits the Wolf Pup ${tickXp} xp for ${kills} kills; one span ${spanXp} for ${spanKills}`,
      `combat chain credits the Wolf Pup ${tickXp} xp for ${kills} kills (span: ${spanXp} for ${spanKills})`);
  }

  // P1 — parity at the cap: the chain clamps once, like the span.
  {
    const near = M.cxp.COMPANION_XP_CAP - 7;
    const s = gatherSession('sparrow', near);
    const chain = M.gather.settleGatherSession(s, T0, T0 + SPAN_MS, GEOM);
    const tickXp = companionAdd(chain.intents.map((i) => i.args.p_delta), 'sparrow');
    const span = accrueSpan(M, s, T0, chain.watermarkMs, GC, 1);
    const spanXp = span.accrued ? companionAdd([span.delta], 'sparrow') : 0;
    judge('P1', spanXp === 7 && tickXp === spanXp,
      `7 xp under the cap: chain ${tickXp} == span ${spanXp} — one clamp, not one per window`,
      `7 xp under the cap: chain ${tickXp} vs span ${spanXp} (the chain must not clamp per window against a stale xp)`);
  }

  // MEASURED, not asserted: the utility pet's per-window floor.
  {
    const s = gatherSession('fox', 0);
    const chain = M.gather.settleGatherSession(s, T0, T0 + SPAN_MS, GEOM);
    const tickXp = companionAdd(chain.intents.map((i) => i.args.p_delta), 'fox');
    const span = accrueSpan(M, s, T0, chain.watermarkMs, GC, 1);
    const spanXp = span.accrued ? companionAdd([span.delta], 'fox') : 0;
    log(`  · measured: utility Fox (0.5/action) — chain ${tickXp} xp vs span ${spanXp} xp `
      + '(per-window floor; needs a server-owned remainder, DB lane)');
  }
  return red;
}

if (!MUTATE) {
  console.log('\nworld-tick-companion-xp');
  let red;
  try { red = run(await load(ROOT), console.log); } catch (e) {
    console.error(`harness: ${e && e.stack || e}`); process.exit(2);
  }
  if (red.size) { console.log(`\nworld-tick-companion-xp: RED — ${[...red].join(', ')}`); process.exit(1); }
  console.log('\nworld-tick-companion-xp: green — a tick chain credits the pet what one accrue span does.');
  process.exit(0);
}

console.log('\nworld-tick-companion-xp --mutate');
let missed = 0;
for (const m of MUTANTS) {
  const base = await copyWith(m.edits);
  let red;
  try { red = run(await load(base), () => {}); } catch (e) {
    console.error(`harness: mutant "${m.name}" threw: ${e && e.stack || e}`); process.exit(2);
  }
  const caught = m.arms.every((a) => red.has(a));
  console.log(`  ${caught ? '✓' : '✗'} ${m.name} → red [${[...red].join(', ')}], wanted [${m.arms.join(', ')}]`);
  if (!caught) missed++;
}
if (missed) { console.log(`\nworld-tick-companion-xp --mutate: RED — ${missed} mutant(s) survived`); process.exit(1); }
console.log('\nworld-tick-companion-xp --mutate: green — every mutant caught by name.');
process.exit(0);
