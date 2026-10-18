#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/collection-wire-shape.mjs — THE SERVER'S COLLECTION COUNT ON THE WIRE,
// AND THE COLLECTION-LOG GATE THAT READS IT (Ledger of Firsts, 2026-09-27).
//
//   node tests/collection-wire-shape.mjs             the guard
//   node tests/collection-wire-shape.mjs --selftest  mutation proof
//
// hr_claim_milestone verifies an items rung against count(hr_collection_of)
// (distinct COMBAT drops) and a monsters rung against count(hr_bestiary_of).
// The log used to gate on G.collection / G.bestiary and offer Claim on rungs
// the server refused (CLAUDE.md §6). hr-accrue now reads the count in its own
// savepoint and emits `collection: { found }` beside every `bestiary` spread.
//
// Node cannot import Deno .ts, so the read and the projection are LIFTED OUT
// OF index.ts's BYTES at named anchors and EXECUTED (the trophy-wire-shape
// pattern). (The consumer, the old client's collection-log.js, retired with it on 2026-10-17.)
//
//   C1  hr_collection_of answers → { found: n }, read with the VERIFIED user/slot
//   C2  42883 → null → the key is OMITTED (absence stays absence)
//   C3  any other error PROPAGATES (a swallowed error is a skipped guard)
//   C4  every `...(bestiary ? { bestiary } : {})` emit carries the collection spread
//
// Exit: 0 green · 1 a finding · 2 harness (an anchor moved).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const INDEX_TS = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts');
const SELFTEST = process.argv.includes('--selftest');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  ✗ ${msg}`); } };
class Harness extends Error {}

const READ_OPEN = '      let collectionFound: number | null = null;';
const READ_CLOSE = '      return { ...(row as Row), bestiary_rows: kills, trophy_rows: trophyRows,';
const PROJ_OPEN = '    const collectionFoundRaw = (read as Record<string, unknown>)?.collection_found;';
const PROJ_CLOSE = '\n    const st = env.state;';
const BESTIARY_SPREAD = '...(bestiary ? { bestiary } : {})';
const COLLECTION_SPREAD = '...(collection ? { collection } : {})';

function slice(src, open, close, what) {
  const i = src.indexOf(open);
  const j = i < 0 ? -1 : src.indexOf(close, i + open.length);
  if (i < 0 || j < 0) throw new Harness(`index.ts anchors moved — could not lift the ${what} (open ${i}, close ${j})`);
  return src.slice(i, j);
}
function stripTs(body) {
  const out = body
    .replace(/let collectionFound: number \| null =/, 'let collectionFound =')
    .replace(/\(sp: typeof tx\)/g, '(sp)')
    .replace(/ as unknown as Row\[\]/g, '')
    .replace(/\(e as \{ code\?: string \} \| null\)/g, '(e)')
    .replace(/const collection: \{ found: number \} \| null =/, 'const collection =')
    .replace(/\(read as Record<string, unknown>\)/g, 'read');
  if (/:\s*(Array|Record|string|number|typeof)\b|\bas (unknown|Row)\b/.test(out)) {
    throw new Harness('a TypeScript annotation survived the lift — the transform is stale');
  }
  return out;
}
function liftRead(src) {
  const body = stripTs(slice(src, READ_OPEN, READ_CLOSE, 'collection read'));
  // eslint-disable-next-line no-new-func
  return new Function('tx', 'user', 'slot', `return (async () => { ${body}\n return collectionFound; })();`);
}
function liftProjection(src) {
  const body = stripTs(slice(src, PROJ_OPEN, PROJ_CLOSE, 'collection projection'));
  // eslint-disable-next-line no-new-func
  return new Function('read', `${body}\n return collection;`);
}
/** A fake postgres.js transaction: savepoint(fn) → fn(sp), sp a tagged template. */
function fakeTx(behaviour) {
  const seen = [];
  const sp = (strings, ...values) => {
    seen.push({ text: strings.join('?'), values });
    if (behaviour.throwCode) { const e = new Error('boom'); e.code = behaviour.throwCode; return Promise.reject(e); }
    return Promise.resolve(behaviour.rows);
  };
  return { seen, tx: { savepoint: async (fn) => fn(sp) } };
}

async function run(indexSrc) {
  // ── C1..C3 — the READ, executed ──────────────────────────────────────────
  const read = liftRead(indexSrc);
  const USER = 'u-verified', SLOT = 2;
  const a = fakeTx({ rows: [{ n: 25 }] });
  const n = await read(a.tx, USER, SLOT);
  ok(n === 25, `C1: hr_collection_of answered 25 and the read produced ${n}`);
  ok(a.seen.length === 1 && /public\.hr_collection_of\(/.test(a.seen[0].text) && /count\(\*\)/.test(a.seen[0].text),
    `C1: the read is not count(*) over public.hr_collection_of: ${JSON.stringify(a.seen)}`);
  ok(a.seen[0] && a.seen[0].values[0] === USER && a.seen[0].values[1] === SLOT,
    `C1: the read must bind the VERIFIED user and slot, got ${JSON.stringify(a.seen[0] && a.seen[0].values)}`);
  const z = await read(fakeTx({ rows: [{ n: 0 }] }).tx, USER, SLOT);
  ok(z === 0, `C1: a server that answered 0 must read 0 (a truthful none), got ${z}`);

  const m = await read(fakeTx({ throwCode: '42883' }).tx, USER, SLOT);
  ok(m === null, `C2: on 42883 the read must degrade to null, got ${m}`);

  let threw = null;
  try { await read(fakeTx({ throwCode: '42501' }).tx, USER, SLOT); } catch (e) { threw = e; }
  ok(threw && threw.code === '42501', 'C3: a non-42883 error (42501) was SWALLOWED — only 42883 may degrade');

  // ── C2 cont. — the PROJECTION: present / omitted ─────────────────────────
  const project = liftProjection(indexSrc);
  const p25 = project({ collection_found: 25 });
  ok(p25 && p25.found === 25 && Object.keys(p25).length === 1, `C2: found 25 must project { found: 25 }, got ${JSON.stringify(p25)}`);
  const p0 = project({ collection_found: 0 });
  ok(p0 && p0.found === 0, `C2: found 0 must project a PRESENT { found: 0 }, got ${JSON.stringify(p0)}`);
  const pn = project({ collection_found: null });
  ok(pn === null, `C2: a null count (42883) must project null so the key is OMITTED, got ${JSON.stringify(pn)}`);

  // ── C4 — every emit that spreads bestiary spreads collection too ─────────
  const bSites = indexSrc.split(BESTIARY_SPREAD).length - 1;
  const cSites = indexSrc.split(COLLECTION_SPREAD).length - 1;
  ok(bSites >= 4, `C4: expected >= 4 bestiary emit sites in index.ts, found ${bSites}`);
  ok(cSites === bSites, `C4: ${bSites} bestiary emit sites but ${cSites} collection spreads — a response path drops the count`);
  let at = -1;
  while ((at = indexSrc.indexOf(BESTIARY_SPREAD, at + 1)) >= 0) {
    const tail = indexSrc.slice(at, at + BESTIARY_SPREAD.length + 60);
    ok(tail.includes(COLLECTION_SPREAD), `C4: the bestiary spread at offset ${at} is not followed by the collection spread`);
  }
  ok(!/\bcollection:\s*\{\s*found:(?!\s*number\b)/.test(indexSrc.replace(/\/\*[\s\S]*?\*\//g, '')),
    'C4: an unconditional `collection: { found … }` literal is emitted somewhere — absence must stay absence');

  return failed;
}

const MUTATIONS = {
  swallow_every_error: {
    what: 'the read swallows every error, not just 42883', file: 'index', expect: 'C3',
    find: "        if (String((e as { code?: string } | null)?.code ?? '') !== '42883') throw e;\n        collectionFound = null;",
    repl: '        collectionFound = null;',
  },
  degrade_to_zero: {
    what: 'the 42883 path degrades to 0 — a missing function reads as "no drops found"', file: 'index', expect: 'C2',
    find: '        collectionFound = null;\n      }\n      return',
    repl: '        collectionFound = 0;\n      }\n      return',
  },
  always_emit: {
    what: 'the projection emits { found: 0 } when the server did not answer', file: 'index', expect: 'C2',
    find: '        ? { found: Math.max(0, Math.floor(collectionFoundRaw)) }\n        : null;',
    repl: '        ? { found: Math.max(0, Math.floor(collectionFoundRaw)) }\n        : { found: 0 };',
  },
  emit_site_dropped: {
    what: 'the not-accrued boot response stops carrying the count', file: 'index', expect: 'C4',
    find: '        ...(bestiary ? { bestiary } : {}),\n        ...(collection ? { collection } : {}),\n        ...(Array.isArray((env',
    repl: '        ...(bestiary ? { bestiary } : {}),\n        ...(Array.isArray((env',
  },
  control_comment_only: {
    what: 'NEGATIVE CONTROL — an inert comment inside the lifted read', file: 'index', expect: null,
    find: '        collectionFound = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;',
    repl: '        collectionFound = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; /* control */',
  },
};

const main = async () => {
  const indexSrc = await readFile(INDEX_TS, 'utf8');
  if (!SELFTEST) {
    failed = await run(indexSrc);
    if (failed) { console.error(`\ncollection-wire-shape: RED — ${failed} finding(s).`); process.exit(1); }
    console.log('collection-wire-shape: green — `collection.found` is read with the verified user, omitted on 42883, '
      + 'propagates any other error, rides every bestiary emit.');
    return;
  }
  let missed = 0;
  for (const [name, m] of Object.entries(MUTATIONS)) {
    const base = indexSrc;
    if (base.split(m.find).length - 1 !== 1) { console.error(`  HARNESS: anchor for ${name} matched ${base.split(m.find).length - 1} times`); process.exit(2); }
    const mut = base.replace(m.find, () => m.repl);
    failed = 0;
    const seen = []; const realErr = console.error;
    console.error = (l) => { seen.push(String(l)); };
    try { await run(mut); }
    finally { console.error = realErr; }
    const hit = seen.some((l) => l.includes(`✗ ${m.expect}:`));
    if (m.expect === null) {
      if (failed) { console.error(`  MISSED  ${name} — the negative control went red: ${seen[0]}`); missed++; }
      else console.log(`  silent  ${name}\n            ${m.what}`);
    } else if (!failed) { console.error(`  MISSED  ${name} — planted and NOTHING went red`); missed++; }
    else if (!hit) { console.error(`  MISWIRED ${name} — red, but not by ${m.expect}: ${seen[0]}`); missed++; }
    else console.log(`  caught  ${name} via ${m.expect}\n            ${m.what}`);
  }
  if (missed) { console.error(`\ncollection-wire-shape --selftest: ${missed} mutation(s) not caught.`); process.exit(1); }
  console.log(`\nall ${Object.keys(MUTATIONS).length - 1} planted defects caught by name, the negative control silent.`);
};
main().catch((e) => { console.error(e instanceof Harness ? `harness: ${e.message}` : e); process.exit(2); });
