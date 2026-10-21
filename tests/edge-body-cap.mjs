#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/edge-body-cap.mjs — THE ENGINE READS AT MOST 64 KB OF A REQUEST.
//
//   node tests/edge-body-cap.mjs            the rules
//   node tests/edge-body-cap.mjs --mutate   every planted defect must turn its rule RED
//
// mutant-anchors: supabase/functions/hr-accrue/request.js supabase/functions/hr-accrue/index.ts
// mutant-writes-tree: no — mutants are planted into a temp copy of the edge
//
// Security, reopen review 2026-10-19: index.ts read the body with req.json(), so a
// client could make the engine buffer and parse a payload of any size.
//   BC-1  a streamed body past MAX_BODY_BYTES (no Content-Length) is refused, not buffered
//   BC-2  a declared Content-Length past it is refused before a byte is read
//   BC-3  a body at the cap, and an ordinary intent, are read whole and parsed
//   BC-4  index.ts reads the body only through readBodyBytes at MAX_INTENT_BYTES (no req.json / req.text)
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = 'supabase/functions/hr-accrue';

function streamOf(bytes, chunk) {
  let at = 0;
  return new ReadableStream({ pull(c) { if (at >= bytes.length) { c.close(); return; } c.enqueue(bytes.slice(at, at + chunk)); at += chunk; } });
}

async function rules(base) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const R = await import(pathToFileURL(join(base, FN, 'request.js')).href);
  const max = R.MAX_INTENT_BYTES;
  ok(max === 65536, `BC-0 the cap is ${max}, want 65536`);
  const big = new Uint8Array(max + 1).fill(32);
  const a = await R.readBodyBytes(new Request('http://x/', { method: 'POST', body: streamOf(big, 4096), duplex: 'half' }), max);
  ok(a === null, 'BC-1 a streamed body one byte past the cap was read (' + (a && a.byteLength) + ' bytes)');
  /* As the platform hands it over (a Node Request may not carry a caller's Content-Length): headers + stream. */
  const lying = { headers: new Headers({ 'content-length': String(max + 10) }),
    body: new ReadableStream({ pull(c) { c.close(); } }) };
  const b = await R.readBodyBytes(lying, max);
  ok(b === null && lying.body.locked === false, 'BC-2 a declared oversize body was read (or not refused)');
  const at = await R.readBodyBytes(new Request('http://x/', { method: 'POST', body: streamOf(new Uint8Array(max).fill(32), 8192), duplex: 'half' }), max);
  ok(at instanceof Uint8Array && at.byteLength === max, 'BC-3 a body exactly at the cap was not read whole');
  const intent = await R.readBodyBytes(new Request('http://x/', { method: 'POST', body: JSON.stringify({ slot: 0, verb: 'hunt_settle' }) }), max);
  ok(R.bodyJson(intent).verb === 'hunt_settle', 'BC-3 an ordinary intent was not parsed');
  const src = readFileSync(join(base, FN, 'index.ts'), 'utf8');
  ok(!/\breq\.(json|text|arrayBuffer|formData|blob)\s*\(/.test(src) && /readBodyBytes\(req, MAX_INTENT_BYTES\)/.test(src), 'BC-4 index.ts reads the body outside the capped reader');
  return fails;
}

const MUTANTS = [
  ['the stream is not counted (BC-1)', 'request.js', '      if (n > limit) {', '      if (false) {', /^BC-1/],
  ['the declared length is trusted to read on (BC-2)', 'request.js', '  if (Number.isFinite(declared) && declared > limit) return null;', '', /^BC-2/],
  ['index.ts reads req.json() again (BC-4)', 'index.ts', '  const bytes = await readBodyBytes(req, MAX_INTENT_BYTES);', '  const bytes = new TextEncoder().encode(JSON.stringify(await req.json().catch(() => ({}))));', /^BC-4/],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(ROOT);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? `edge-body-cap: ${fails.length} rule(s) RED` : 'edge-body-cap: a body past 64 KB is refused unread; index.ts reads only through the cap');
    process.exit(fails.length ? 1 : 0);
  }
  let escaped = 0;
  for (const [name, file, from, to, arm] of MUTANTS) {
    const base = mkdtempSync(join(tmpdir(), 'hr-cap-'));
    try {
      cpSync(join(ROOT, FN), join(base, FN), { recursive: true });
      const p = join(base, FN, file);
      const s = readFileSync(p, 'utf8');
      if (s.split(from).length !== 2) { console.error(`harness: anchor for "${name}" not found once`); process.exit(2); }
      writeFileSync(p, s.replace(from, to));
      const fails = await rules(base);
      const hit = fails.some((f) => arm.test(f));
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${name}${hit ? '' : ' ' + JSON.stringify(fails)}`);
      if (!hit) escaped++;
    } finally { rmSync(base, { recursive: true, force: true }); }
  }
  console.log(escaped ? `edge-body-cap --mutate: ${escaped} ESCAPED` : `edge-body-cap --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
  process.exit(escaped ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
