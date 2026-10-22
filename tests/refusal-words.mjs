#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/refusal-words.mjs — EVERY REFUSAL THE CLIENT CAN RECEIVE READS IN PLAIN WORDS.
//
// Andy live 10-21: equipping Iron Platelegs said "Not done. The server refused
// it." while hr_rejections held requirement_not_met with the item named. The
// class: a code with no line fell to one generic sentence. Claims:
//   RW1 every code a client RPC can answer with (each RPC the client calls, its
//       __ungated twin and every server function they reach, in apply order's
//       latest bodies: `'error', '<code>'` and hr_reject('<code>')), every code
//       the hr-accrue edge answers with (INTENT_ERRORS and its literals) and
//       every code the client mints itself reads as its own line or its
//       family's — never as REFUSAL_FALLBACK
//   RW2 a code nobody knows still reads as a sentence that says nothing changed
//   RW3 an item refused on its requirement says the numbers: "Iron Platelegs
//       needs Defense 15 (you have 1)." — and without a character, the need alone
//   RW4 the refusal the session hands back names the item the server named
//       (hr_apply's detail, one level down on an edge refusal; a malformed id never)
//
//   node tests/refusal-words.mjs            run
//   node tests/refusal-words.mjs --mutate   each planted defect must turn a claim red
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* The latest body of every SQL function, in apply order. */
function latestBodies(root) {
  const order = JSON.parse(readFileSync(join(root, 'tests/schema-apply-order.json'), 'utf8')).order;
  const last = new Map();
  for (const f of order) {
    let src;
    try { src = readFileSync(join(root, 'supabase/migrations', f), 'utf8'); } catch { continue; }
    const re = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi;
    const starts = [];
    let m;
    while ((m = re.exec(src))) starts.push([m.index, m[1].toLowerCase()]);
    for (let i = 0; i < starts.length; i++) last.set(starts[i][1], src.slice(starts[i][0], i + 1 < starts.length ? starts[i + 1][0] : src.length));
  }
  return last;
}
const jsFiles = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? jsFiles(join(d, e.name)) : /\.(js|ts)$/.test(e.name) ? [join(d, e.name)] : []));

/** Every refusal code the client can receive: { code -> where it comes from }. */
export function clientCodes(root) {
  const codes = new Map();
  const add = (c, from) => { if (/^[a-z][a-z0-9_]*[a-z0-9]$/.test(c) && c !== 'ok' && !codes.has(c)) codes.set(c, from); };
  /* The server: each RPC the client calls, and every function it reaches. */
  const bodies = latestBodies(root);
  const rpcs = new Set();
  for (const f of jsFiles(join(root, 'src'))) for (const m of readFileSync(f, 'utf8').matchAll(/rpc\('(hr_[a-z0-9_]+)'/g)) rpcs.add(m[1]);
  const seen = new Set();
  const walk = (n, from) => {
    if (seen.has(n) || !bodies.has(n)) return;
    seen.add(n);
    const b = bodies.get(n);
    /* (not `x->>'error', 'hunt'`: a key read, then the next key of an object) */
    for (const m of b.matchAll(/(?<!>)'error',\s*'([a-z0-9_]+)'/g)) add(m[1], from + ' (' + n + ')');
    for (const m of b.matchAll(/hr_reject\('([a-z0-9_]+)'/g)) add(m[1], from + ' (' + n + ')');
    for (const m of b.matchAll(/\b(hr_[a-z0-9_]+)\s*\(/g)) walk(m[1], from);
  };
  for (const n of rpcs) { walk(n, n); walk(n + '__ungated', n); }
  /* The edge and the client: every literal error code, and the edge's code table. */
  for (const f of jsFiles(join(root, 'supabase/functions/hr-accrue')).concat(jsFiles(join(root, 'src/session')), jsFiles(join(root, 'src/net')))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/error:\s*'([a-z0-9_]+)'/g)) add(m[1], f.slice(root.length + 1));
    for (const m of src.matchAll(/^\s+[A-Z_]+:\s*'([a-z0-9_]+)',\s*$/gm)) if (/intents\.js$/.test(f)) add(m[1], 'INTENT_ERRORS');
  }
  for (const c of ['http_404', 'http_429', 'http_500', 'timeout', 'busy', 'no_room']) add(c, 'client');
  return codes;
}

async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return { IW: await import(u('src/shell/intent-words.js')), RW: await import(u('src/data/refusal-words.js')),
    CS: await import(u('src/session/character-session.js')), root };
}

/* A character as the session reads it: skills only. */
const csWith = (skills) => ({ read: (k) => (k === 'skills' ? skills : undefined) });

const CLAIMS = {
  RW1: (M) => {
    const out = [];
    const codes = clientCodes(M.root);
    if (codes.size < 100) out.push('RW1 the walk found only ' + codes.size + ' codes: the extraction broke, not the table');
    for (const [c, from] of codes) if (M.IW.refusalWords(c) === M.RW.REFUSAL_FALLBACK) out.push('RW1 ' + c + ' (from ' + from + ') has no line of its own or by family');
    for (const c of ['requirement_not_met', 'activity_running', 'bad_store', 'two_handed']) if (!codes.has(c)) out.push('RW1 the walk no longer finds ' + c + ': the extraction lost a source');
    return out;
  },
  RW2: (M) => {
    const s = M.IW.refusalWords('zz_never_a_code');
    return s === M.RW.REFUSAL_FALLBACK && /nothing was changed/.test(s) && !/zz_/.test(s) ? [] : ['RW2 an unknown code reads ' + JSON.stringify(s)];
  },
  RW3: (M) => {
    const out = [];
    const with1 = M.IW.refusalText({ ok: false, error: 'requirement_not_met', item: 'iron_platelegs' }, csWith({ defense: { xp: 0, level: 1 } }));
    if (with1 !== 'Iron Platelegs needs Defense 15 (you have 1).') out.push('RW3 the Iron Platelegs refusal reads ' + JSON.stringify(with1));
    const bare = M.IW.refusalText({ ok: false, error: 'requirement_not_met', item: 'iron_platelegs' });
    if (bare !== 'Iron Platelegs needs Defense 15.') out.push('RW3 without a character it reads ' + JSON.stringify(bare));
    const noItem = M.IW.refusalText({ ok: false, error: 'requirement_not_met' });
    if (noItem === M.RW.REFUSAL_FALLBACK || !/skill/.test(noItem)) out.push('RW3 with no item named it reads ' + JSON.stringify(noItem));
    return out;
  },
  RW4: async (M) => {
    const out = [];
    const cs = new M.CS.CharacterSession({ slot: 0, uid: 'u', server: { intents: null } });
    /* The edge's equip refusal (equip.js refusalBody: hr_apply's answer under `detail`), and an RPC's own detail. */
    const edge = await cs._settled({ ok: false, status: 409, body: { ok: false, error: 'requirement_not_met', stage: 'equip',
      detail: { ok: false, error: 'requirement_not_met', detail: { item_id: 'iron_platelegs' } } } });
    if (edge.error !== 'requirement_not_met' || edge.item !== 'iron_platelegs') out.push('RW4 the edge refusal came back as ' + JSON.stringify(edge));
    const rpc = await cs._settled({ ok: true, body: { ok: false, error: 'requirement_not_met', detail: { item_id: 'iron_platelegs' } } });
    if (rpc.item !== 'iron_platelegs') out.push('RW4 an RPC refusal came back as ' + JSON.stringify(rpc));
    const forged = await cs._settled({ ok: true, body: { ok: false, error: 'requirement_not_met', detail: { item_id: '<img>' } } });
    if (forged.item !== null) out.push('RW4 a malformed item id was handed on: ' + JSON.stringify(forged));
    return out;
  },
};

async function run(root) {
  const M = await load(root);
  const out = [];
  for (const [k, fn] of Object.entries(CLAIMS)) { try { out.push(...(await fn(M))); } catch (e) { out.push(k + ' threw ' + (e && e.stack || e)); } }
  return out;
}

const MUTANTS = [
  ['RW1', 'the Iron Platelegs code loses its line and its family', 'src/data/refusal-words.js', "  requirement_not_met: 'Your skill is too low to use that yet.',\n", ''],
  ['RW1', 'the bad_* family is gone', 'src/data/refusal-words.js', "  [/^(bad|missing)_[a-z0-9_]+$|_shape$|^unknown_(verb|op|delta_key|rpc)$/, 'That request was not valid, so nothing was changed.'],\n", ''],
  ['RW1', 'the old one-word fallback for every unlisted code', 'src/shell/intent-words.js', '  return (typeof code === \'string\' && familyWords(code)) || REFUSAL_FALLBACK;', '  return REFUSAL_FALLBACK;'],
  ['RW2', 'the fallback says nothing about what changed', 'src/data/refusal-words.js', "export const REFUSAL_FALLBACK = 'That did not go through, so nothing was changed. Try again in a moment.';", "export const REFUSAL_FALLBACK = 'Not done: the server refused it.';"],
  ['RW3', 'the requirement is not said with its numbers', 'src/shell/intent-words.js', '    const w = requirementWords(r.item, cs);', '    const w = null;'],
  ['RW3', 'the hero\'s own level is not read', 'src/shell/intent-words.js', '  const sk = cs ? skillsOf(cs) : null;', '  const sk = null;'],
  ['RW4', 'the session drops the item', 'src/session/refusal.js', '    field: typeof b.field === \'string\' ? b.field.slice(0, 32) : null, item };', '    field: typeof b.field === \'string\' ? b.field.slice(0, 32) : null };'],
];

if (process.argv.includes('--mutate')) {
  let missed = 0;
  for (const [claim, name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'rw-'));
    try {
      for (const d of ['src', 'supabase', 'tests/schema-apply-order.json']) cpSync(join(ROOT, d), join(tmp, d), { recursive: true });
      const p = join(tmp, file);
      const s = readFileSync(p, 'utf8');
      if (s.split(from).length !== 2) { console.log('  HARNESS anchor moved: ' + name); missed++; continue; }
      writeFileSync(p, s.replace(from, () => to));
      const red = (await run(tmp)).filter((x) => x.startsWith(claim));
      console.log((red.length ? '  RED (good) ' : '  MISSED     ') + claim + ' ' + name);
      if (!red.length) missed++;
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log('refusal-words --mutate: ' + MUTANTS.length + ' mutants, ' + missed + ' missed');
  process.exit(missed ? 1 : 0);
}

const problems = await run(ROOT);
if (problems.length) { for (const p of problems) console.log('  ✗ ' + p); console.log('refusal-words: RED'); process.exit(1); }
console.log('refusal-words: OK — ' + clientCodes(ROOT).size + ' refusal codes the client can receive, each with plain words');
