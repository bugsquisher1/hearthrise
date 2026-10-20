#!/usr/bin/env node
// tests/bug-report-bridge-bounds.mjs — the bug-report relay's two hostile-input bounds
//
//   node tests/bug-report-bridge-bounds.mjs             # the guard
//   node tests/bug-report-bridge-bounds.mjs --selftest  # every mutation must be CAUGHT
//
// mutant-anchors: none — every --selftest mutation transforms an in-memory copy of the source, never a file
//
// Drives the SHIPPED supabase/functions/bug-report-bridge/bounds.js (plain JS)
// with real Request / ReadableStream objects, and reads index.ts to prove the
// entry uses it. No network, no credential.
//
//   B1  a CHUNKED body (no Content-Length) past the cap is refused, and the
//       reader stops pulling right after the cap — it never buffers the rest.
//   B2  a declared Content-Length past the cap is refused before any byte is read.
//   B3  an honest body comes back byte-identical.
//   B4  a masked link `[text](url)` in any player string never reaches the
//       staff embed as live markdown (title, description, every field).
//   B5  worst-case over-long player strings keep the embed inside Discord's
//       limits (title 256, description 4096, field 1024, total 6000).
//   B6  index.ts reads through readBodyBytes and builds through buildEmbed —
//       no `arrayBuffer()`, no second local embed builder.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = join(ROOT, 'supabase/functions/bug-report-bridge');
const BOUNDS_SRC = readFileSync(join(FN, 'bounds.js'), 'utf8');
const INDEX_SRC = readFileSync(join(FN, 'index.ts'), 'utf8');

async function load(src) {
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}

/* A chunked stream far longer than any cap under test (64 KB) that records how
   much was pulled and whether it was cancelled. Finite, and each pull yields a
   macrotask, so a mutant that ignores the cap terminates instead of starving
   the event loop. */
function endless(chunk = 256, total = 65536) {
  const probe = { pulled: 0, cancelled: false };
  const stream = new ReadableStream({
    async pull(c) {
      await new Promise((r) => setImmediate(r));
      if (probe.pulled >= total) { c.close(); return; }
      probe.pulled += chunk; c.enqueue(new Uint8Array(chunk).fill(0x41));
    },
    cancel() { probe.cancelled = true; },
  }, { highWaterMark: 0 });
  return { stream, probe };
}

/* A live masked link is `[` ... `](` with neither bracket escaped. */
function liveMaskedLink(s) {
  return /(^|[^\\])\[[^\]]*(^|[^\\])\]\(/.test(s) || /(^|[^\\])\]\(/.test(s);
}

async function arms(boundsSrc, indexSrc) {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  let m;
  try { m = await load(boundsSrc); } catch (e) { return [`bounds.js does not load: ${e.message}`]; }
  const { readBodyBytes, buildEmbed } = m;
  if (typeof readBodyBytes !== 'function' || typeof buildEmbed !== 'function') {
    return ['bounds.js must export readBodyBytes and buildEmbed'];
  }
  const LIMIT = 1000, CHUNK = 256;

  // B1 — chunked, no Content-Length, endless.
  {
    const { stream, probe } = endless(CHUNK);
    const req = { headers: new Headers(), body: stream };
    const r = await Promise.race([
      readBodyBytes(req, LIMIT),
      new Promise((res) => setTimeout(() => res('timeout'), 2000)),
    ]);
    ok(r !== 'timeout' && r && r.ok === false && r.reason === 'too_large',
      `B1: an endless chunked body must be refused as too_large (got ${JSON.stringify(r)})`);
    ok(probe.pulled <= LIMIT + 2 * CHUNK,
      `B1: the reader pulled ${probe.pulled} bytes against a ${LIMIT}-byte cap — it is buffering past the cap`);
    ok(probe.cancelled, 'B1: the stream was not cancelled after the cap');
  }

  // B2 — declared length over the cap: refused, nothing read.
  {
    const { stream, probe } = endless(CHUNK);
    const req = { headers: new Headers({ 'content-length': String(LIMIT + 1) }), body: stream };
    const r = await Promise.race([
      readBodyBytes(req, LIMIT),
      new Promise((res) => setTimeout(() => res('timeout'), 2000)),
    ]);
    ok(r !== 'timeout' && r && r.ok === false && r.reason === 'too_large',
      `B2: a declared oversize body must be refused (got ${JSON.stringify(r)})`);
    ok(probe.pulled === 0, `B2: ${probe.pulled} bytes were read before the declared-length refusal`);
  }

  // B3 — honest body, real Request.
  {
    const text = JSON.stringify({ summary: 'ok', description: 'é'.repeat(100) });
    const req = new Request('http://x/', { method: 'POST', body: text });
    const r = await readBodyBytes(req, LIMIT);
    ok(r && r.ok === true && new TextDecoder().decode(r.bytes) === text,
      'B3: an honest body under the cap must come back byte-identical');
  }

  // B4 — masked links everywhere a player can type.
  {
    const link = '[Click to verify](https://evil.example/phish)';
    const state = {
      device: link, orientation: link, activeTab: link, viewport: link,
      metrics: { screen: link, dpr: link, zoom: link, rootFont: link,
        safeArea: { t: link, r: link, b: link, l: link } },
    };
    const e = buildEmbed(link, link, link, link, state, [{ level: 'log', msg: link }], 7, false);
    ok(!liveMaskedLink(e.title), `B4: title carries a live masked link: ${e.title}`);
    ok(!liveMaskedLink(e.description), `B4: description carries a live masked link: ${e.description}`);
    for (const f of e.fields) {
      if (f.value.startsWith('```')) continue; // markdown does not render inside a code block
      ok(!liveMaskedLink(f.value), `B4: field "${f.name}" carries a live masked link: ${f.value}`);
    }
    ok(!/```[^]*```[^]*```/.test(e.fields.find((f) => f.name === 'State').value.slice(3, -3)),
      'B4: a player string closed the State code fence');
  }

  // B5 — worst case: every char escapable, every field huge.
  {
    const huge = '['.repeat(20000);
    const state = {
      device: huge, orientation: huge, activeTab: huge, viewport: huge,
      metrics: { screen: huge, dpr: huge, zoom: huge, rootFont: huge, desktopMode: true,
        safeArea: { t: huge, r: huge, b: huge, l: huge } },
    };
    const errs = Array.from({ length: 20 }, () => ({ level: huge.slice(0, 24), msg: huge.slice(0, 500) }));
    const e = buildEmbed(huge, huge.slice(0, 200), huge.slice(0, 4000), huge.slice(0, 64), state, errs, huge, true);
    ok(e.title.length <= 256, `B5: title is ${e.title.length} chars (Discord max 256)`);
    ok(e.description.length <= 4096, `B5: description is ${e.description.length} chars (Discord max 4096)`);
    let total = e.title.length + e.description.length;
    for (const f of e.fields) {
      ok(f.value.length <= 1024, `B5: field "${f.name}" is ${f.value.length} chars (Discord max 1024)`);
      ok(f.value.length <= 900 || f.name === 'Screen' || f.value.startsWith('```'),
        `B5: field "${f.name}" is ${f.value.length} chars — a per-field cap is missing`);
      total += f.name.length + f.value.length;
    }
    const screen = e.fields.find((f) => f.name === 'Screen').value;
    ok(/safe\(t\/r\/b\/l\)/.test(screen) && /DESKTOP-MODE/.test(screen),
      'B5: one over-long Screen cell crowded the rest out of the field — a per-cell cap is missing');
    ok(total <= 6000,`B5: embed total is ${total} chars (Discord max 6000)`);
  }

  // B6 — the entry is wired to these, and only these.
  {
    ok(/import\s*\{[^}]*readBodyBytes[^}]*\}\s*from\s*'\.\/bounds\.js'/.test(indexSrc)
      && /await readBodyBytes\(req/.test(indexSrc),
      'B6: index.ts does not read the body through readBodyBytes from ./bounds.js');
    ok(!/\.arrayBuffer\s*\(/.test(indexSrc.replace(/\/\/.*$/gm, '')),
      'B6: index.ts calls arrayBuffer() — an unmetered whole-body read');
    ok(/import\s*\{[^}]*buildEmbed[^}]*\}\s*from\s*'\.\/bounds\.js'/.test(indexSrc)
      && !/function\s+buildEmbed\s*\(/.test(indexSrc),
      'B6: index.ts must build the staff embed with bounds.js buildEmbed, not a local copy');
  }
  return fails;
}

const MUTANTS = [
  { name: 'drop the streaming byte cap', arm: 'B1', file: 'bounds',
    from: 'if (n > limit) {', to: 'if (false) {' },
  { name: 'drop the declared-length refusal', arm: 'B2', file: 'bounds',
    from: "if (Number.isFinite(declared) && declared > limit) return { ok: false, reason: 'too_large' };", to: '' },
  { name: 'stop escaping brackets/parens', arm: 'B4', file: 'bounds',
    from: "/[\\\\`*_~|>#<\\[\\]()-]/g", to: "/[\\\\`*_~|>#<-]/g" },
  { name: 'uncap the per-field cells', arm: 'B5', file: 'bounds',
    from: 'const CELL_CHARS = 100;', to: 'const CELL_CHARS = 100000;' },
  { name: 'uncap the screen cells', arm: 'B5', file: 'bounds',
    from: 'const SCREEN_CELL_CHARS = 48;', to: 'const SCREEN_CELL_CHARS = 100000;' },
  { name: 'index.ts back on arrayBuffer()', arm: 'B6', file: 'index',
    from: 'const read = await readBodyBytes(req, MAX_BODY_BYTES);',
    to: 'const read = { ok: true, bytes: new Uint8Array(await req.arrayBuffer()) };' },
];

const selftest = process.argv.includes('--selftest');
const clean = await arms(BOUNDS_SRC, INDEX_SRC);
if (!selftest) {
  if (clean.length) {
    console.error('✗ bug-report-bridge bounds:\n  ' + clean.join('\n  '));
    process.exit(1);
  }
  console.log('✓ bug-report-bridge bounds: B1–B6 green (metered body read, escaped + capped staff embed)');
  process.exit(0);
}

if (clean.length) {
  console.error('✗ selftest: the CLEAN tree is red, so no mutant verdict means anything:\n  ' + clean.join('\n  '));
  process.exit(1);
}
let missed = 0;
for (const mu of MUTANTS) {
  const src = mu.file === 'bounds' ? BOUNDS_SRC : INDEX_SRC;
  if (!src.includes(mu.from)) {
    console.error(`✗ mutant "${mu.name}": anchor not found — the mutation is stale`);
    missed++; continue;
  }
  const mutated = src.replace(mu.from, mu.to);
  const fails = mu.file === 'bounds' ? await arms(mutated, INDEX_SRC) : await arms(BOUNDS_SRC, mutated);
  const caught = fails.some((f) => f.startsWith(mu.arm));
  if (caught) console.log(`✓ mutant "${mu.name}" caught by ${mu.arm}`);
  else { console.error(`✗ mutant "${mu.name}" NOT caught by ${mu.arm} (fails: ${fails.join(' | ') || 'none'})`); missed++; }
}
if (missed) process.exit(1);
console.log(`✓ selftest: all ${MUTANTS.length} mutations caught, clean arm green`);
