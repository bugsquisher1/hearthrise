#!/usr/bin/env node
// ============================================================
// tools/gen-art.mjs — batch AI art generation via the Recraft API.
//
// SAFETY MODEL: the default run is a DRY RUN — it parses the manifest,
// prints what it WOULD generate and the exact dollar cost, and exits
// without touching the network. Nothing is generated without --confirm.
// Tyler's standing order (2026-08-16): no batch runs until the in-game
// pilot mockup is approved.
//
//   node tools/gen-art.mjs docs/design/art-pilot-prompts.md            # dry run
//   node tools/gen-art.mjs docs/design/art-pilot-prompts.md --confirm  # spend
//   flags: --limit N   --concurrency N (default 3)   --model NAME
//          --out DIR (default assets/art-pilot/hearthfire)
//
// MANIFEST FORMAT — either:
//   (a) a .md file in the art-pilot-prompts.md shape: headings like
//       "### 3 · `iron_sword.png` — ..." followed by a ```fenced prompt```,
//       with category taken from the nearest "## CATEGORY" heading; or
//   (b) a .json file: [{ "file": "monsters/goblin.png", "prompt": "..." }]
//
// API (verified against recraft.ai/docs 2026-08-16):
//   POST https://external.api.recraft.ai/v1/images/generations
//     Authorization: Bearer <token from ~/.recraft-token>
//     { prompt, model, n, size, response_format }
//   $0.04/image (40 units); removeBackground $0.01 (10 units).
//   API units are purchased separately from the web subscription.
//
// ALPHA GUARD: every downloaded PNG has its colour type read from the
// IHDR chunk (byte 25). Colour type 6 = RGBA, accepted. Anything else is
// routed through /v1/images/removeBackground once; if it STILL has no
// alpha the file is saved with a `.noalpha.png` suffix and reported —
// never silently shipped, because a flattened white square in an
// inventory slot is exactly the kind of defect nobody notices until
// players do.
//
// RESUME: an output file that already exists is skipped, so an
// interrupted batch continues where it stopped. Delete a file to redo it.
// The token never appears in argv, output, or errors.
// ============================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const API = 'https://external.api.recraft.ai/v1';
const COST_GEN = 0.04, COST_RMBG = 0.01;

const argv = process.argv.slice(2);
const manifestPath = argv.find(a => !a.startsWith('--'));
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const CONFIRM = argv.includes('--confirm');
const LIMIT = Number(flag('limit', Infinity));
const CONC = Math.max(1, Number(flag('concurrency', 3)));
const MODEL = flag('model', 'recraftv3');
const OUT = flag('out', 'assets/art-pilot/hearthfire');

if (!manifestPath) {
  console.error('usage: node tools/gen-art.mjs <manifest.md|manifest.json> [--confirm] [--limit N]');
  process.exit(2);
}

function readToken() {
  for (const f of ['.recraft-token', '.recraft-token.txt']) {
    const p = path.join(os.homedir(), f);
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8').trim();
      if (t) return t;
    }
  }
  console.error('no token: put your Recraft API key in ~/.recraft-token');
  process.exit(2);
}

function parseManifest(p) {
  const raw = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  if (p.endsWith('.json')) {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) throw new Error('json manifest must be an array');
    return rows.map(r => {
      if (!r.file || !r.prompt) throw new Error(`json row missing file/prompt: ${JSON.stringify(r).slice(0, 80)}`);
      return { file: r.file, prompt: r.prompt };
    });
  }
  // markdown shape: "## CATEGORY" sections, "### n · `name.png`" + fenced prompt
  const out = [];
  let category = 'misc';
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const h2 = lines[i].match(/^## ([A-Z][A-Z ]+)$/);
    if (h2) { category = h2[1].trim().toLowerCase().replace(/s$/, '') + 's'; continue; }
    const h3 = lines[i].match(/^### .*`([a-z0-9_]+\.png)`/);
    if (!h3) continue;
    // find the next fenced block
    let j = i + 1;
    while (j < lines.length && !lines[j].startsWith('```')) j++;
    const start = ++j;
    while (j < lines.length && !lines[j].startsWith('```')) j++;
    const prompt = lines.slice(start, j).join(' ').replace(/\s+/g, ' ').trim();
    if (!prompt) throw new Error(`no fenced prompt found for ${h3[1]}`);
    // category folder normalisation to match the pilot layout
    const folder = ({ items: 'items', weapons: 'weapons', foods: 'food', armours: 'armour', monsters: 'monsters' })[category] || category;
    out.push({ file: `${folder}/${h3[1]}`, prompt });
  }
  if (!out.length) throw new Error('manifest parsed to zero entries — wrong file or wrong shape');
  return out;
}

function pngColourType(buf) {
  // PNG signature 8 bytes, IHDR length+type 8, data: width 4, height 4, bitdepth 1, colourtype 1
  if (buf.length < 26 || buf[0] !== 0x89 || buf[1] !== 0x50) return -1;
  return buf[25];
}

async function post(token, url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`${url.split('/').pop()} HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function generateOne(token, job) {
  const dest = path.join(OUT, job.file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const gen = await post(token, `${API}/images/generations`, {
    prompt: job.prompt, model: MODEL, n: 1, size: '1024x1024', response_format: 'url',
  });
  const url = gen?.data?.[0]?.url;
  if (!url) throw new Error('no image url in response');
  let buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  let cost = COST_GEN, rmbg = false;
  if (pngColourType(buf) !== 6) {
    const cut = await post(token, `${API}/images/removeBackground`, { image_url: url, response_format: 'url' });
    const cutUrl = cut?.image?.url;
    if (cutUrl) {
      buf = Buffer.from(await (await fetch(cutUrl)).arrayBuffer());
      cost += COST_RMBG; rmbg = true;
    }
  }
  const ok = pngColourType(buf) === 6;
  fs.writeFileSync(ok ? dest : dest.replace(/\.png$/, '.noalpha.png'), buf);
  return { file: job.file, ok, rmbg, cost };
}

const jobs = parseManifest(manifestPath)
  .filter(j => !fs.existsSync(path.join(OUT, j.file)))
  .slice(0, LIMIT);

const estMax = (jobs.length * (COST_GEN + COST_RMBG)).toFixed(2);
console.log(`manifest: ${manifestPath}`);
console.log(`to generate: ${jobs.length} image(s) -> ${OUT}/  (existing files skipped)`);
console.log(`cost: $${(jobs.length * COST_GEN).toFixed(2)} base, $${estMax} worst-case with bg-removal`);

if (!CONFIRM) {
  for (const j of jobs) console.log(`  would generate ${j.file}  (${j.prompt.slice(0, 60)}...)`);
  console.log('\nDRY RUN — nothing generated, nothing spent. Re-run with --confirm to spend.');
  process.exit(0);
}

const token = readToken();
let spent = 0, failed = 0;
const queue = [...jobs];
async function worker() {
  for (;;) {
    const job = queue.shift();
    if (!job) return;
    try {
      const r = await generateOne(token, job);
      spent += r.cost;
      console.log(`  ✓ ${r.file}${r.rmbg ? ' (bg removed)' : ''}${r.ok ? '' : '  ⚠ NO ALPHA — saved as .noalpha.png'}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${job.file}: ${String(e.message).slice(0, 160)}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`\ndone: ${jobs.length - failed}/${jobs.length} generated, ~$${spent.toFixed(2)} spent${failed ? `, ${failed} FAILED (re-run to retry just those)` : ''}`);
process.exit(failed ? 1 : 0);
