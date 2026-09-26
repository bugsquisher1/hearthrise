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
// pattern); the consumer, src/features/collection-log.js, is executed in a vm.
//
//   C1  hr_collection_of answers → { found: n }, read with the VERIFIED user/slot
//   C2  42883 → null → the key is OMITTED (absence stays absence)
//   C3  any other error PROPAGATES (a swallowed error is a skipped guard)
//   C4  every `...(bestiary ? { bestiary } : {})` emit carries the collection spread
//   C5  the client gate: earned reads ONLY the server mirrors; no mirror → nothing
//
// Exit: 0 green · 1 a finding · 2 harness (an anchor moved).
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const INDEX_TS = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts');
const CLOG_JS = join(ROOT, 'src', 'features', 'collection-log.js');
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

/** collection-log.js in a vm with a stub window — the real consumer. */
async function loadClient(src) {
  const window = { G: {}, MONSTERS: {}, ITEMS: {}, addItem() {}, killMonster() {}, clientMayWriteRecordField: () => false };
  const ctx = vm.createContext({ window, console: { log() {}, warn() {} }, setTimeout() {}, document: {} });
  vm.runInContext(src, ctx, { filename: 'collection-log.js' });
  if (!window.HearthriseCollection) throw new Harness('collection-log.js did not publish window.HearthriseCollection');
  return window;
}

async function run(indexSrc, clientSrc) {
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

  // ── C5 — THE CONSUMER: earned reads ONLY the server mirrors ──────────────
  const W = await loadClient(clientSrc);
  const C = W.HearthriseCollection;
  const ids = (list) => list.map((x) => x.id);
  const mons = (k) => { const o = Object.create(null); for (let i = 0; i < k; i++) o['m' + i] = 1; return o; };
  const residue = (k, pre) => { const o = {}; for (let i = 0; i < k; i++) o[pre + i] = { kills: 1 }; return o; };

  // LEDGER-4 shape: no mirror → nothing claimable, even with a rich residue.
  W.G = { bestiary: residue(60, 'x'), collection: {}, collectionLog: { claimed: [] } };
  for (let i = 0; i < 80; i++) W.G.collection['it' + i] = 5;
  ok(C.claimable(W.G).length === 0, `C5: no server mirror, yet ${JSON.stringify(ids(C.claimable(W.G)))} claimable off the residue`);

  // LEDGER-1 shape: server 25 monsters, residue 40 → hunter25 yes, hunter40 no.
  W.G = { bestiary: residue(40, 'x'), collectionLog: { claimed: [] }, _bestiaryTrophies: { killsByMonster: mons(25) } };
  const c1 = ids(C.claimable(W.G));
  ok(c1.includes('hunter25'), `C5: server count 25 must make hunter25 claimable, got ${JSON.stringify(c1)}`);
  ok(!c1.includes('hunter40'), `C5: hunter40 claimable at a SERVER count of 25 (residue 40) — ${JSON.stringify(c1)}`);

  // LEDGER-2 shape: residue 30 items, server found 10 → collect25 no; 10/25 next.
  W.G = { collection: {}, collectionLog: { claimed: [] } };
  for (let i = 0; i < 30; i++) W.G.collection['it' + i] = 1;
  ok(C.noteServerCounts({ collection: { found: 10 } }) === true, 'C5: noteServerCounts refused a well-formed block');
  ok(!ids(C.claimable(W.G)).includes('collect25'), 'C5: collect25 claimable at server found 10 (residue 30)');
  const nx = C.nextRungs(W.G).find((r) => r.m.domain === 'items');
  ok(nx && nx.m.id === 'collect25' && nx.have === 10 && nx.goal === 25, `C5: next items rung should read collect25 10/25, got ${JSON.stringify(nx && { id: nx.m.id, have: nx.have, goal: nx.goal })}`);
  C.noteServerCounts({ collection: { found: 25 } });
  ok(ids(C.claimable(W.G)).includes('collect25'), 'C5: collect25 not claimable at server found 25');
  C.noteServerCounts({ ok: true });
  ok(W.G._collectionServer && W.G._collectionServer.found === 25, 'C5: an envelope WITHOUT the key changed the mirror — absence is never a zero');

  // LEDGER-3 shape: a server claim row marks it claimed whatever the residue says.
  W.G = { collectionLog: { claimed: [] }, _bestiaryTrophies: { killsByMonster: mons(30) } };
  C.noteServerClaims([{ kind: 'collection', key: 'hunter25', period: '', state: 'claimed' },
                      { kind: 'collection', key: 'trophy:slime:1', period: '', state: 'claimed' }]);
  ok(!ids(C.claimable(W.G)).includes('hunter25'), 'C5: a server kind=collection claim row did not mark hunter25 claimed');
  ok(ids(C.claimable(W.G)).includes('hunter10'), 'C5: hunter10 (unclaimed on the server) stopped being claimable');
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
  gate_on_residue_monsters: {
    what: 'the monsters gate pointed back at G.bestiary', file: 'client', expect: 'C5',
    find: "    if (b && b.killsByMonster && typeof b.killsByMonster === 'object') out.monsters = Object.keys(b.killsByMonster).length;",
    repl: "    if (G.bestiary) out.monsters = Object.keys(G.bestiary).length;",
  },
  gate_on_residue_items: {
    what: 'the items gate pointed back at G.collection', file: 'client', expect: 'C5',
    find: "    if (c && typeof c.found === 'number' && isFinite(c.found)) out.items = Math.max(0, Math.floor(c.found));",
    repl: "    if (G.collection) out.items = Object.keys(G.collection).length;",
  },
  claims_residue_only: {
    what: 'claimed reads only the residue, ignoring the server claim rows', file: 'client', expect: 'C5',
    find: '    return !!(Array.isArray(sv) && sv.indexOf(id) >= 0);',
    repl: '    return false;',
  },
  control_comment_only: {
    what: 'NEGATIVE CONTROL — an inert comment inside the lifted read', file: 'index', expect: null,
    find: '        collectionFound = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;',
    repl: '        collectionFound = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; /* control */',
  },
};

const main = async () => {
  const indexSrc = await readFile(INDEX_TS, 'utf8');
  const clientSrc = await readFile(CLOG_JS, 'utf8');
  if (!SELFTEST) {
    failed = await run(indexSrc, clientSrc);
    if (failed) { console.error(`\ncollection-wire-shape: RED — ${failed} finding(s).`); process.exit(1); }
    console.log('collection-wire-shape: green — `collection.found` is read with the verified user, omitted on 42883, '
      + 'propagates any other error, rides every bestiary emit, and the log earns rungs from server counts only.');
    return;
  }
  let missed = 0;
  for (const [name, m] of Object.entries(MUTATIONS)) {
    const base = m.file === 'index' ? indexSrc : clientSrc;
    if (base.split(m.find).length - 1 !== 1) { console.error(`  HARNESS: anchor for ${name} matched ${base.split(m.find).length - 1} times`); process.exit(2); }
    const mut = base.replace(m.find, () => m.repl);
    failed = 0;
    const seen = []; const realErr = console.error;
    console.error = (l) => { seen.push(String(l)); };
    try { await (m.file === 'index' ? run(mut, clientSrc) : run(indexSrc, mut)); }
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
