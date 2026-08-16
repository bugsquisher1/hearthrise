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
const STYLE_ID = flag('style-id', process.env.RECRAFT_STYLE_ID || '');
const NO_SNAP = argv.includes('--no-alpha-snap');

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
  // A later section that names the same output file is a CORRECTION of an
  // earlier one (art-pilot-prompts.md's re-run block is exactly this), so the
  // last occurrence wins. Without this the same path is generated twice in one
  // run and which prompt survives depends on which worker finishes last —
  // a nondeterministic result nobody would ever debug.
  const byFile = new Map();
  for (const j of out) {
    if (byFile.has(j.file)) console.log(`  note: ${j.file} redefined later in the manifest — using the LAST definition`);
    byFile.set(j.file, j);
  }
  return [...byFile.values()];
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
  const body = {
    prompt: job.prompt, model: MODEL, n: 1, size: '1024x1024', response_format: 'url',
  };
  // A Recraft custom Style is the only lever that acts on all 600 images at
  // once — prompt text pins subject and bans, not HAND. See
  // docs/design/art-direction-picker.md §0.10. `style` and `style_id` are
  // mutually exclusive at the API, so we only ever send the one we were given.
  if (STYLE_ID) body.style_id = STYLE_ID;
  const gen = await post(token, `${API}/images/generations`, body);
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

// ── THE PROMPT-LENGTH GATE ──────────────────────────────────────────────────
// Recraft's generation endpoint rejects anything over 1000 characters:
//   HTTP 400 invalid_request_parameter "prompt length should be in [1, 1000]"
// The first cut of the Hearthfire wrapper assembled to a median of 1141 and a
// max of 1665 — 15 of 16 prompts over the cap, i.e. a 600-image batch that
// would have failed 100%. It was found by a four-image verification run rather
// than by a batch, and cost $0.00 only because rejected requests are not
// charged. This gate makes that luck unnecessary: the check runs BEFORE the
// dry-run summary and before any spend, on every path.
// See docs/design/art-direction-picker.md §0.2 and §0.13.
const PROMPT_MAX = 1000;
const tooLong = jobs.filter((j) => j.prompt.length > PROMPT_MAX);
const empty = jobs.filter((j) => !j.prompt.trim().length);
if (tooLong.length || empty.length) {
  console.error(`\nREFUSING TO RUN — ${tooLong.length + empty.length} prompt(s) the API will reject:`);
  for (const j of tooLong.sort((a, b) => b.prompt.length - a.prompt.length).slice(0, 20)) {
    console.error(`  ✗ ${j.file}: ${j.prompt.length} chars (cap ${PROMPT_MAX}, over by ${j.prompt.length - PROMPT_MAX})`);
  }
  if (tooLong.length > 20) console.error(`  … and ${tooLong.length - 20} more`);
  for (const j of empty) console.error(`  ✗ ${j.file}: empty prompt`);
  console.error('\nShorten the wrapper or the subject line — do NOT raise the cap, it is the API\'s.');
  process.exit(2);
}
const longest = jobs.reduce((m, j) => Math.max(m, j.prompt.length), 0);

const estMax = (jobs.length * (COST_GEN + COST_RMBG)).toFixed(2);
console.log(`manifest: ${manifestPath}`);
console.log(`to generate: ${jobs.length} image(s) -> ${OUT}/  (existing files skipped)`);
console.log(`cost: $${(jobs.length * COST_GEN).toFixed(2)} base, $${estMax} worst-case with bg-removal`);
console.log(`prompt length: longest ${longest}/${PROMPT_MAX} chars — all within the API cap`);
if (!STYLE_ID) console.log('WARNING: no --style-id. The wrapper no longer describes brushwork (the style anchor carries it),\n         so output will be markedly weaker than the pilot. See art-direction-picker.md §0.10.');

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
