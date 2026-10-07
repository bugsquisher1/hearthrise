#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/replay-scope-guard.mjs — A MUTANT STOPS AT ITS OWN GUARD'S FILES
//
//   node tests/replay-scope-guard.mjs             the guard
//   node tests/replay-scope-guard.mjs --selftest  every planted defect must go RED
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// A guard's --mutate/--selftest plants a defect in ITS migration and asks its
// own arms (or its own self-check) to name it. Replayed over the WHOLE chain,
// every newer file is an extra judge: a later §0 md5 lock, grant-hygiene gate or
// self-check refuses first and the guard reads "refused for the WRONG reason".
// CI db-replay-5 on set/b564 (world-tick-channel-arm, 5 mutants "survived"
// because 2026-10-09-party-hunt-start-gate.sql refused first) was the fifth
// time; each earlier fix was a per-file allowlist of downstream refusals that
// went stale on the next migration.
//
// The class is closed in tests/schema-replay.mjs: bootReplay refuses a patched
// replay that does not declare its scope — `upTo` (usually LAST_PATCHED) or a
// `fullChain` sentence for a guard that genuinely judges the chain end (the
// drift/census guards, a DOWNSTREAM mutant). This file proves that refusal is
// still there and that every caller in tests/ and tools/ declares a scope.
//
//   RS1  replayScopeError refuses a patched replay with no scope, an empty
//        fullChain, fullChain + upTo, and fullChain on a plain replay; accepts
//        upTo, LAST_PATCHED, a later file carried as data, a fullChain
//        sentence, and a plain (unpatched) replay.
//   RS2  bootReplay itself refuses an unscoped mutant BEFORE booting anything.
//   RS3  every bootReplay call site that passes patches names upTo or fullChain
//        (an options object built in a variable must set .upTo or .fullChain).
// ════════════════════════════════════════════════════════════════════════
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, replayScopeError, LAST_PATCHED, ROOT } from './schema-replay.mjs';

const SELFTEST = process.argv.includes('--selftest');
const P = (file) => new Map([[file, [['a', 'b']]]]);

// ── RS1 — the predicate ────────────────────────────────────────────────────
function rs1(scope) {
  const bad = [];
  const refuses = (id, opts) => { if (!scope(opts)) bad.push(`RS1 ${id}: accepted`); };
  const accepts = (id, opts) => { const e = scope(opts); if (e) bad.push(`RS1 ${id}: refused — ${e.split('\n')[0]}`); };
  refuses('unscoped mutant', { patches: P('b.sql') });
  refuses('empty fullChain', { patches: P('b.sql'), fullChain: '' });
  refuses('fullChain + upTo', { patches: P('b.sql'), upTo: 'c.sql', fullChain: 'a later file names the mutated body' });
  refuses('fullChain on a plain replay', { fullChain: 'a later file names the mutated body' });
  accepts('plain replay', {});
  accepts('empty patch map', { patches: new Map() });
  accepts('upTo own file', { patches: P('b.sql'), upTo: 'b.sql' });
  accepts('LAST_PATCHED', { patches: P('b.sql'), upTo: LAST_PATCHED });
  accepts('a later file carried as data', { patches: P('c.sql'), upTo: 'b.sql' });
  accepts('fullChain sentence', { patches: P('b.sql'), fullChain: 'a later file names the mutated body' });
  return bad;
}

// ── RS2 — the engine refuses, before PGlite is even loaded ─────────────────
async function rs2(boot) {
  try {
    const r = await boot({ patches: P('2026-10-06-world-tick-channel-arm.sql') });
    await r?.db?.close?.();
    return ['RS2 bootReplay ran an unscoped mutant replay'];
  } catch (e) {
    return e && e.replayScope ? [] : [`RS2 bootReplay failed for another reason: ${String(e && e.message).split('\n')[0]}`];
  }
}

// ── RS3 — every caller declares its scope ──────────────────────────────────
function callSites(text) {
  const out = [];
  let i = 0;
  while ((i = text.indexOf('bootReplay(', i)) >= 0) {
    const lineStart = text.lastIndexOf('\n', i) + 1;
    const prefix = text.slice(lineStart, i);
    const isDecl = /function\s+$/.test(text.slice(Math.max(0, i - 20), i));
    const inComment = /\/\/|^\s*\*|\/\*/.test(prefix) || /`[^`]*$/.test(prefix);
    let d = 0, j = i + 'bootReplay'.length;
    for (; j < text.length; j++) {
      if (text[j] === '(') d++;
      else if (text[j] === ')') { d--; if (!d) break; }
    }
    if (!isDecl && !inComment) out.push({ line: text.slice(0, i).split('\n').length, args: text.slice(i + 11, j) });
    i = j;
  }
  return out;
}

function rs3Text(name, text) {
  const bad = [];
  for (const { line, args } of callSites(text)) {
    const a = args.trim();
    if (/^[A-Za-z_$][\w$]*$/.test(a)) {
      // An options object built elsewhere: if it ever gets patches, it must get a scope.
      const id = a.replace(/\$/g, '\\$');
      const setsPatches = new RegExp(`\\b${id}\\.patches\\s*=`).test(text);
      const setsScope = new RegExp(`\\b${id}\\.(upTo|fullChain)\\s*=`).test(text);
      if (setsPatches && !setsScope) bad.push(`RS3 ${name}:${line} bootReplay(${a}) — ${a}.patches is set but never ${a}.upTo / ${a}.fullChain`);
      continue;
    }
    /* `upTo` must carry a VALUE: the shorthand `{ patches, upTo }` is undefined
       whenever the caller did not pass one (bank-cap-rungs, 2026-10-07). */
    if (/\bpatches\b/.test(a) && !/\bupTo\s*:|\bfullChain\b/.test(a)) {
      bad.push(`RS3 ${name}:${line} bootReplay(${a.replace(/\s+/g, ' ').slice(0, 90)}) — patched with no upTo/fullChain`);
    }
  }
  return bad;
}

async function rs3() {
  const bad = [];
  let sites = 0;
  for (const dir of ['tests', 'tools']) {
    for (const f of (await readdir(join(ROOT, dir))).filter((n) => n.endsWith('.mjs')).sort()) {
      if (dir === 'tests' && (f === 'schema-replay.mjs' || f === 'replay-scope-guard.mjs')) continue;
      const text = await readFile(join(ROOT, dir, f), 'utf8');
      sites += callSites(text).length;
      bad.push(...rs3Text(`${dir}/${f}`, text));
    }
  }
  return { bad, sites };
}

// ── THE GUARD ──────────────────────────────────────────────────────────────
if (!SELFTEST) {
  console.log('\nreplay-scope-guard: a mutant replay stops at its own guard\'s files');
  const bad = [...rs1(replayScopeError), ...(await rs2(bootReplay))];
  const { bad: b3, sites } = await rs3();
  bad.push(...b3);
  for (const b of bad) console.log(`  ✗ ${b}`);
  if (!bad.length) console.log(`  ✓ RS1 the scope predicate refuses all 4 unscoped shapes, accepts all 6 honest ones\n`
    + '  ✓ RS2 bootReplay refuses an unscoped mutant before booting\n'
    + `  ✓ RS3 ${sites} bootReplay call sites in tests/ + tools/ — every patched one declares upTo or fullChain`);
  console.log(bad.length ? `\nRED: ${bad.length}` : '\nGREEN');
  process.exit(bad.length ? 1 : 0);
}

// ── --selftest: each planted defect must turn its arm RED ───────────────────
console.log('\nreplay-scope-guard --selftest: every planted defect must go RED');
const MUTANTS = [
  { name: 'predicateAcceptsAll', arm: 'RS1', run: async () => rs1(() => null) },
  { name: 'predicateTakesBothScopes', arm: 'RS1', run: async () => rs1((o) => (o.upTo && o.fullChain ? null : replayScopeError(o))) },
  { name: 'predicateTakesEmptyOptIn', arm: 'RS1',
    run: async () => rs1((o) => (o.fullChain === '' ? null : replayScopeError(o))) },
  { name: 'engineSkipsTheCheck', arm: 'RS2', run: async () => rs2(async () => ({ db: null })) },
  { name: 'unscopedLiteral', arm: 'RS3',
    run: async () => rs3Text('planted.mjs', 'const { db } = await bootReplay({ patches });\n') },
  { name: 'unscopedTernary', arm: 'RS3',
    run: async () => rs3Text('planted.mjs', 'await bootReplay(patches ? { patches } : {});\n') },
  { name: 'shorthandUpTo', arm: 'RS3',
    run: async () => rs3Text('planted.mjs', 'async function boot({ mutate, upTo } = {}) {\n  await bootReplay({ patches: p(mutate), upTo });\n}\n') },
  { name: 'unscopedOptsObject', arm: 'RS3',
    run: async () => rs3Text('planted.mjs', 'const opts = {};\nif (p) opts.patches = p;\nawait bootReplay(opts);\n') },
];
/* NEGATIVE CONTROLS: honest shapes must stay GREEN, or RS3 is matching words. */
const CONTROLS = [
  ['scoped literal', 'await bootReplay({ patches, upTo: LAST_PATCHED });\n'],
  ['full-chain opt-in', "await bootReplay({ patches, fullChain: 'the census judges every chain-end table' });\n"],
  ['scoped opts object', 'const opts = {};\nif (p) { opts.patches = p; opts.upTo = MIG; }\nawait bootReplay(opts);\n'],
  ['plain replay', 'await bootReplay({});\nawait bootReplay();\n'],
  ['comment', '// bootReplay({ patches }) used to replay the whole chain\n'],
];
let survived = 0;
for (const m of MUTANTS) {
  const red = (await m.run()).filter((b) => b.startsWith(m.arm));
  if (red.length) console.log(`  ✓ ${m.name} — RED via ${m.arm} (${red[0].slice(0, 90)})`);
  else { survived++; console.log(`  ✗ ${m.name} — SURVIVED`); }
}
for (const [name, text] of CONTROLS) {
  const bad = rs3Text('control.mjs', text);
  if (bad.length) { survived++; console.log(`  ✗ control "${name}" went RED: ${bad[0]}`); }
  else console.log(`  ✓ control "${name}" stays green`);
}
console.log(survived ? `\n${survived} failure(s)` : `\nall ${MUTANTS.length} mutants red, ${CONTROLS.length} controls green`);
process.exit(survived ? 1 : 0);
