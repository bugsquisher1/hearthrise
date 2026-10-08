#!/usr/bin/env node
// ============================================================================
// tools/deploy-differential.mjs — THE GATHER DEPLOY DIFFERENTIAL, ONE COMMAND
//
//   node tools/deploy-differential.mjs <oldSha> <newSha> --probe <probe.json>
//   node tools/deploy-differential.mjs <sha> <sha> --probe <p> --plant <name>
//                                     one defect planted in the NEW pack copy
//   node tools/deploy-differential.mjs <sha> --probe <p> --selftest
//                                     every plant must exit 1, the control 0
//
// docs/planning/SEC_GATHER_ARM_RUNBOOK_2026-10-06.md: once gather is armed it
// has no probe, so every edge deploy carries this differential BEFORE it
// ships. Any mismatch (exit 1) means: do not deploy; if it already shipped,
// disarm first and re-earn 6 probes.
//
// The PROBE is an engine session snapshot taken off a real probe window (the
// envelope's engine inputs: the shape tick-shadow.js `hydrate` takes). It is a
// player's state, so it is passed in and NEVER committed (fixtures carry no
// real user id). Both packs are read straight out of git (`git archive` of
// supabase/functions/hr-accrue + src at each sha) — no checkout is touched.
//
//   (i)   ONE SPAN and the 1,440 x 10 s CHAIN: the one-span delta and every
//         10 s step's delta are byte-identical, old pack vs new; the chain's
//         flush intents (settleGatherSession, 10 s cadence, 90 s flush) are
//         byte-identical on every key except `progress`.
//   (ii)  `progress`: coalesceProgress(old) deep-equals new, per intent (THIS
//         checkout's coalescer, tick-contract.js RULE 2b — never the pack's). A pack with no
//         coalescing on either side reduces this to byte equality, because
//         coalescing an already-coalesced list is the identity.
//   (iii) Both chains applied through the REPLAYED hr_apply (this checkout's
//         migration chain, PGlite) from ONE starting row seeded from the
//         probe: the same accept/refuse answer per window, and identical state
//         (player_state/skills/inventory/progress/equipment/bank) and ledger
//         rows, excluding ids and timestamps. One transaction, so hr_apply's
//         now() is one instant for both characters.
//
// Read-only on git and on production: no network, no credentials, no writes
// outside the OS temp dir. Exit: 0 identical · 1 mismatch · 2 harness.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { readFile as readF, writeFile } from 'node:fs/promises';
import { bootReplay, ROOT } from '../tests/schema-replay.mjs';

const STEPS = 1440;
const STEP_MS = 10000;
const GEOM = { cadenceMs: STEP_MS, flushMs: 90000 };

function harness(msg) { console.error(`deploy-differential: ${msg}`); process.exit(2); }

/* THE PLANTS (--selftest / --plant): one defect each, in the NEW pack copy
   only, each a different arm's subject. */
const FN = 'supabase/functions/hr-accrue/';
const PLANTS = {
  'drop-op': { arms: 'ii, iii', file: `${FN}tick-contract.js`,
    find: '      prev.add += add;\n', repl: '' },
  'merge-keys': { arms: 'ii, iii', file: `${FN}tick-contract.js`,
    find: "    const id = `${op.kind}\\u0000${op.key}\\u0000${op.period ?? ''}`;", repl: '    const id = `${op.kind}`;' },
  'intent-key': { arms: 'i', file: `${FN}tick-gather.js`,
    find: '  folded.accrued_to = new Date(windowToMs).toISOString();\n',
    repl: '  folded.accrued_to = new Date(windowToMs).toISOString();\n'
      + '  if (folded.xp) for (const k of Object.keys(folded.xp)) folded.xp[k] += 1;\n' },
};

const args = process.argv.slice(2);
const valueOf = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const probePath = valueOf('--probe');
const plant = valueOf('--plant');
const positional = args.filter((a, i) => !a.startsWith('--') && !['--probe', '--plant'].includes(args[i - 1]));
if (args.includes('--selftest')) {
  const sha = positional[0];
  if (!sha || !probePath) harness('usage: node tools/deploy-differential.mjs <sha> --probe <probe.json> --selftest');
  const run = (extra) => spawnSync(process.execPath, [process.argv[1], sha, sha, '--probe', probePath, ...extra],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
  let bad = 0;
  const ctl = run([]);
  console.log(`  ${ctl.status === 0 ? '✓' : '✗'} control (nothing planted) -> exit ${ctl.status}`);
  if (ctl.status !== 0) bad++;
  for (const [name, p] of Object.entries(PLANTS)) {
    const r = run(['--plant', name]);
    const arms = [...new Set([...r.stdout.matchAll(/✗ (\w+) —/g)].map((m) => m[1]))].join(', ');
    const caught = r.status === 1 && p.arms.split(', ').every((a) => arms.split(', ').includes(a));
    console.log(`  ${caught ? '✓' : '✗'} plant ${name} -> exit ${r.status}, red [${arms}], wanted [${p.arms}]`);
    if (!caught) bad++;
  }
  console.log(bad ? `\ndeploy-differential --selftest: RED (${bad})`
    : '\ndeploy-differential --selftest: green — the control passes, every plant is caught.');
  process.exit(bad ? 1 : 0);
}
const [oldSha, newSha] = positional;
if (!oldSha || !newSha || !probePath) {
  harness('usage: node tools/deploy-differential.mjs <oldSha> <newSha> --probe <probe.json>');
}
if (plant && !PLANTS[plant]) harness(`unknown plant "${plant}" (${Object.keys(PLANTS).join(', ')})`);

/** One pack, extracted from git at `sha` into a temp dir; its modules imported. */
async function packAt(sha, planted = null) {
  const rev = spawnSync('git', ['rev-parse', '--verify', `${sha}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
  if (rev.status !== 0) harness(`not a commit: ${sha}`);
  const full = rev.stdout.trim();
  const dir = await mkdtemp(join(tmpdir(), `hr-ddiff-${full.slice(0, 8)}-`));
  /* Piped through stdin with `cwd` set: no path reaches tar's argv, so a
     Windows drive letter cannot be read as a remote host. */
  const a = spawnSync('git', ['archive', '--format=tar', full, 'supabase/functions/hr-accrue', 'src'],
    { cwd: ROOT, maxBuffer: 1 << 30 });
  if (a.status !== 0) harness(`git archive ${full} failed: ${a.stderr}`);
  const x = spawnSync('tar', ['-xf', '-'], { cwd: dir, input: a.stdout, maxBuffer: 1 << 26 });
  if (x.status !== 0) harness(`tar -xf failed: ${x.stderr}`);
  if (planted) {
    const p = join(dir, planted.file);
    const src = (await readF(p, 'utf8')).replace(/\r\n/g, '\n');
    if (src.split(planted.find).length !== 2) harness(`plant anchor moved in ${planted.file}`);
    await writeFile(p, src.replace(planted.find, () => planted.repl), 'utf8');
  }
  const at = (p) => import(pathToFileURL(join(dir, p)).href);
  const fn = 'supabase/functions/hr-accrue/';
  const [shadow, gather, combat, contract] = await Promise.all([
    at(`${fn}tick-shadow.js`), at(`${fn}tick-gather.js`), at(`${fn}tick-combat.js`), at(`${fn}tick-contract.js`),
  ]);
  return { sha: full, dir, shadow, gather, combat, contract };
}

/** (i) inputs: one span, the 10 s steps, and the flush intents, for one pack. */
function runPack(P, probe) {
  const clone = () => JSON.parse(JSON.stringify(probe));
  const combat = probe.activeKind === 'combat';
  const tick = combat ? P.combat.combatTick : P.gather.gatherTick;
  const f = probe.accruedToMs;
  const t = f + STEPS * STEP_MS;
  const one = tick(P.shadow.hydrate(clone()), f, t, {});
  const ch = P.shadow.hydrate(clone());
  const steps = [];
  let wm = f;
  for (let now = f + STEP_MS; now <= t; now += STEP_MS) {
    const r = tick(ch, wm, now, {});
    steps.push(r);
    if (r && r.accrued) { P.shadow.advance(ch, r); wm = Date.parse(r.delta.accrued_to); }
  }
  const settle = combat ? P.combat.settleCombatSession : P.gather.settleGatherSession;
  const flush = settle(clone(), f, t, GEOM);
  return { one, steps, intents: flush.intents.map((it) => it.args.p_delta) };
}

const red = [];
const check = (id, cond, okMsg, badMsg) => {
  if (cond) console.log(`  ✓ ${id} — ${okMsg}`); else { red.push(id); console.log(`  ✗ ${id} — ${badMsg}`); }
};
/* Eager-safe: a message is built whether or not it is shown. */
const js = (x) => String(JSON.stringify(x)).slice(0, 300);
const firstDiff = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i;
  return -1;
};

let probe;
try { probe = JSON.parse(await readFile(probePath, 'utf8')); } catch (e) { harness(`cannot read the probe: ${e.message}`); }
if (!Number.isFinite(probe.accruedToMs) || !probe.activeKind) harness('the probe is not an engine session (accruedToMs / activeKind missing)');

console.log(`\ndeploy-differential ${oldSha} -> ${newSha} on ${probe.activeKind}:${probe.activeId}, `
  + `${new Date(probe.accruedToMs).toISOString()} + ${STEPS} x ${STEP_MS / 1000} s`);
const OLD = await packAt(oldSha);
const NEW = await packAt(newSha, plant ? PLANTS[plant] : null);
const cleanup = async () => { await rm(OLD.dir, { recursive: true, force: true }); await rm(NEW.dir, { recursive: true, force: true }); };

let O; let N;
try { O = runPack(OLD, probe); N = runPack(NEW, probe); } catch (e) { await cleanup(); harness(`engine threw: ${e.stack || e}`); }

// (i)
check('i', JSON.stringify(O.one) === JSON.stringify(N.one), 'the one-span delta is byte-identical',
  `the one-span delta differs:\n      old ${js(O.one)}\n      new ${js(N.one)}`);
const sd = firstDiff(O.steps, N.steps);
check('i', sd < 0, `all ${O.steps.length} 10 s steps are byte-identical`,
  `10 s step ${sd} differs:\n      old ${js(O.steps[sd])}\n      new ${js(N.steps[sd])}`);
const noProg = (d) => { const o = { ...d }; delete o.progress; return o; };
const id = firstDiff(O.intents.map(noProg), N.intents.map(noProg));
check('i', O.intents.length === N.intents.length && id < 0,
  `${N.intents.length} flush intents byte-identical on every key but progress`,
  `flush intents differ (${O.intents.length} vs ${N.intents.length}; first at ${id}):\n`
  + `      old ${js(noProg(O.intents[id] || {}))}\n      new ${js(noProg(N.intents[id] || {}))}`);

// (ii)
/* The REFERENCE coalescer is this checkout's (the tool's own tree), never the
   new pack's: a defect planted in the pack under test must not grade itself. */
const { coalesceProgress: coal } = await import(pathToFileURL(join(ROOT, FN, 'tick-contract.js')).href);
if (typeof coal !== 'function') { await cleanup(); harness('this checkout has no tick-contract coalesceProgress'); }
let pd = -1; let rawOps = 0; let newOps = 0;
for (let i = 0; i < Math.min(O.intents.length, N.intents.length); i++) {
  rawOps += (O.intents[i].progress || []).length; newOps += (N.intents[i].progress || []).length;
  if (pd < 0 && !isDeepStrictEqual(coal(O.intents[i].progress || []), N.intents[i].progress || [])) pd = i;
}
check('ii', pd < 0, `coalesceProgress(old.progress) deep-equals new.progress on every intent (${rawOps} -> ${newOps} ops)`,
  `intent ${pd}: coalesceProgress(old) ${js(coal(O.intents[pd]?.progress || []))}\n`
  + `      new ${js(N.intents[pd]?.progress || [])}`);

// (iii)
let db;
try { ({ db } = await bootReplay({})); } catch (e) { await cleanup(); harness(`the migration chain did not replay: ${e.message}`); }
const q = async (sql, p) => (await db.query(sql, p)).rows;
const uOld = '00000000-0000-4000-8000-0000000dd001';
const uNew = '00000000-0000-4000-8000-0000000dd002';
const seed = async (u) => {
  await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
  await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
             active_kind, active_id, active_since, companion_equipped)
           values ($1, 0, $2, 0, $3, $4, 1, to_timestamp($5::double precision / 1000), $6, $7,
                   to_timestamp($8::double precision / 1000), $9)`,
  [u, Math.max(0, Math.floor(probe.gold || 0)), probe.hp, probe.maxHp, probe.accruedToMs, probe.activeKind,
    probe.activeId, probe.activeSinceMs ?? probe.accruedToMs, probe.perks?.companion?.id ?? null]);
  if (probe.toolCarry) await q('update public.player_state set tool_carry = $2::jsonb where user_id = $1', [u, JSON.stringify(probe.toolCarry)]);
  for (const [k, v] of Object.entries(probe.skills || {})) {
    if (Number(v) > 0) await q('insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, $2, $3)', [u, k, Math.floor(v)]);
  }
  for (const [k, v] of Object.entries(probe.inventory || {})) {
    if (Number(v) > 0) await q('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3)', [u, k, Math.floor(v)]);
  }
};
const apply = async (u, delta, iid) => {
  const v = (await q('select version from public.player_state where user_id = $1 and slot = 0', [u]))[0].version;
  await db.exec('savepoint dd'); await db.exec('set local role hr_engine');
  try {
    const r = (await q('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
      [u, v, iid, JSON.stringify(delta)]))[0].r;
    await db.exec('reset role'); await db.exec('release savepoint dd');
    return r;
  } catch (e) {
    await db.exec('rollback to savepoint dd'); await db.exec('reset role');
    return { ok: false, error: `threw: ${String(e.message).slice(0, 100)}` };
  }
};
const answer = (r) => (r && r.ok === true ? 'ok' : `refused:${(r && (r.error || r.why)) || '?'}`);
const STRIP = new Set(['user_id', 'id', 'ts', 'at', 'created_at', 'updated_at']);
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !STRIP.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)));
const stateOf = async (u) => {
  const out = {};
  for (const t of ['player_state', 'player_skills', 'player_inventory', 'player_progress', 'player_equipment', 'player_bank']) {
    out[t] = (await q(`select to_jsonb(t) as j from public.${t} t where user_id = $1`, [u])).map((r) => JSON.stringify(clean(r.j))).sort();
  }
  return out;
};
/* Ledger rows minus ids and timestamps; `meta.intent_id` is shared (one id per
   window index, the same for both characters), so it is compared. */
const ledgerOf = async (u) => (await q(
  'select kind, intent, gold, gold_in, xp_in, qty_in, gems_in, meta from public.player_ledger where user_id = $1 order by id', [u]))
  .map((r) => { if (r.meta && typeof r.meta === 'object') delete r.meta.nth_ever; return JSON.stringify(r); });

let answers;
try {
  await db.exec('begin');
  await seed(uOld); await seed(uNew);
  answers = { old: [], new: [] };
  for (let i = 0; i < O.intents.length; i++) {
    const iid = `00000000-0000-4000-9000-${String(i + 1).padStart(12, '0')}`;
    answers.old.push(answer(await apply(uOld, O.intents[i], iid)));
    answers.new.push(answer(await apply(uNew, N.intents[i], iid)));
  }
  await db.exec('commit');
} catch (e) { try { await db.exec('rollback'); } catch { /* none */ } await cleanup(); harness(`the replay threw: ${e.stack || e}`); }
const ad = firstDiff(answers.old, answers.new);
const accepted = answers.new.filter((a) => a === 'ok').length;
check('iii', ad < 0 && accepted > 0, `hr_apply answered the same for all ${answers.new.length} windows (${accepted} accepted)`,
  ad >= 0 ? `window ${ad}: old ${answers.old[ad]} vs new ${answers.new[ad]}` : 'no window was accepted — the replay proves nothing');
const [sO, sN] = [await stateOf(uOld), await stateOf(uNew)];
let sdiff = null;
for (const t of Object.keys(sO)) if (!isDeepStrictEqual(sO[t], sN[t])) { sdiff = t; break; }
check('iii', !sdiff, 'state byte-identical (player_state, skills, inventory, progress, equipment, bank)',
  `${sdiff} differs:\n      old ${js(sO[sdiff])}\n      new ${js(sN[sdiff])}`);
const [lO, lN] = [await ledgerOf(uOld), await ledgerOf(uNew)];
const ld = firstDiff(lO, lN);
check('iii', ld < 0 && lO.length === lN.length, `${lN.length} ledger rows byte-identical (ids and timestamps excluded)`,
  `ledger row ${ld} differs:\n      old ${lO[ld]}\n      new ${lN[ld]}`);

await cleanup();
if (red.length) {
  console.log(`\ndeploy-differential: MISMATCH (${[...new Set(red)].join(', ')}) — do not deploy; if shipped, disarm first and re-earn 6 probes.`);
  process.exit(1);
}
console.log('\ndeploy-differential: identical — the new pack pays this probe exactly what the old one did.');
process.exit(0);
