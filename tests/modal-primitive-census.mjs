#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/modal-primitive-census.mjs — EVERY FULL-SCREEN LAYER IS A SHEET, OR IS COUNTED
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Measured live at 1384x771: the welcome-back card grew to 1179 px, centred
// itself off both edges of a screen that cannot scroll (html/body are
// overflow:hidden), and its Continue was unreachable. The cause was a CLASS,
// not a card: the game had no modal primitive, so each overlay picked its own
// `Nvh` cap (or none), its own scroll region (or none) and its own Escape (or
// none). The primitive is `.hr-scrim` / `.hr-sheet` (src/styles/art-direction.css)
// with one Escape (src/render/modal-sheet.js).
//
// This is the RATCHET that keeps the class shrinking. It counts full-viewport
// fixed layers — `position:fixed` with `inset:0` (or top/left/right/bottom all
// 0) — declared anywhere under src/ that are NOT the primitive:
//   · CSS rules in src/**/*.css whose selector does not name `.hr-scrim`;
//   · JS strings: cssText, injected `<style>` text and the array-joined
//     `['position:fixed','inset:0',…].join(';')` form, unless `hr-scrim` is
//     named in the same declaration.
// Adopting the primitive means DELETING the layer's own position/inset (the
// scrim supplies them), so an adoption lowers the count here by construction.
//
// A ratchet, not a hard zero: about thirty such layers existed when it was
// written. The total and every per-file count may only fall. A new layer is
// red; a paydown is a note until `--write` lowers the ceiling. Comments and the
// in-page suite's own fixtures (src/features/smoke/**) are not layers.
//
// ALLOWLIST: layers that are full-screen on purpose and are not sheets — each
// named with its reason. Matching is by file + a needle on the declaring line.
//
//   node tests/modal-primitive-census.mjs             gate
//   node tests/modal-primitive-census.mjs --report    gate + every counted site
//   node tests/modal-primitive-census.mjs --write     re-record the ceiling (only after a paydown)
//   node tests/modal-primitive-census.mjs --selftest  mutation proof
//
// Exit: 0 green · 1 a count rose · 2 harness (no baseline, or a plant did not land).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'modal-primitive-census.baseline.json');

export const ALLOWLIST = [
  { file: 'src/styles/legacy.css', needle: 'body::before', why: 'the painted page background, not a dialog' },
  { file: 'src/styles/legacy.css', needle: '#hr-rotate-gate', why: 'the portrait rotate gate: a whole-screen instruction with nothing to scroll' },
  { file: 'src/features/backdrop.js', needle: '#hr-backdrop', why: 'the decorative scene layer at z-index 0, pointer-events:none' },
  { file: 'src/net/account-gate.js', needle: '.hr-gate::before', why: 'a paint layer of the sign-up gate' },
  { file: 'src/net/account-gate.js', needle: '.hr-gate::after', why: 'a paint layer of the sign-up gate' },
  { file: 'src/features/recipe-book.js', needle: "R + '{position:fixed", why: 'a full-screen page with its own column layout, not a card' },
  { file: 'src/ftue.js', needle: '.ftue-root', why: 'the tour root: pointer-events:none, it only positions the tour card' },
  { file: 'src/features/boot-hydration.js', needle: "'position:fixed'", why: 'the boot veil: a status screen shown before the game exists' },
];

const walk = (d) => readdirSync(d).flatMap((f) => {
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/* Comments become spaces, so offsets and line numbers survive. JS `//` comments
   are only stripped at the start of a line's content, which is enough for this
   corpus and never eats a `//` inside a URL string. */
function blankComments(src, css) {
  const keepNl = (m) => m.replace(/[^\n]/g, ' ');
  let out = src.replace(/\/\*[\s\S]*?\*\//g, keepNl);
  if (!css) out = out.replace(/^(\s*)\/\/.*$/gm, (m, lead) => lead + ' '.repeat(m.length - lead.length));
  return out;
}

const FULL = (decl) => /inset\s*:\s*0(?![.\d%a-z])/i.test(decl)
  || ['top', 'left', 'right', 'bottom'].every((k) => new RegExp('(^|[^-a-z])' + k + '\\s*:\\s*0(?![.\\d%a-z])', 'i').test(decl));

/* One site per `position:fixed` whose declaration block is full-viewport. The
   block is bounded by the next `}` or the next `position:` — whichever is first. */
function sitesIn(rel, raw) {
  const css = rel.endsWith('.css');
  const src = blankComments(raw, css);
  const lines = raw.split('\n');
  const out = [];
  for (const m of src.matchAll(/position\s*:\s*fixed/gi)) {
    let block = src.slice(m.index, m.index + 600);
    const nextPos = block.slice(8).search(/position\s*:/i);
    if (nextPos >= 0) block = block.slice(0, nextPos + 8);
    const close = block.indexOf('}');
    if (close >= 0) block = block.slice(0, close);
    if (!FULL(block)) continue;
    const open = src.lastIndexOf('{', m.index);
    const prevClose = src.lastIndexOf('}', m.index);
    const selector = css && open > prevClose ? src.slice(Math.max(prevClose + 1, 0), open) : '';
    const before = src.slice(Math.max(0, m.index - 200), m.index);
    const line = src.slice(0, m.index).split('\n').length;
    const named = css ? /\.hr-scrim\b/.test(selector) : /hr-scrim/.test(block) || /hr-scrim/.test(before.slice(before.lastIndexOf('\n') + 1));
    if (named) continue;
    const text = (css ? selector.trim().split('\n').pop() + ' ' : '') + lines[line - 1].trim();
    const ctx = [lines[line - 2] || '', lines[line - 1], selector].join('\n');
    const allowed = ALLOWLIST.find((a) => a.file === rel && ctx.includes(a.needle));
    out.push({ file: rel, line, text: text.slice(0, 140), allowed: allowed ? allowed.why : null });
  }
  return out;
}

export function census(files) {
  const sites = [];
  for (const [rel, raw] of files) sites.push(...sitesIn(rel, raw));
  const counted = sites.filter((s) => !s.allowed);
  const perFile = {};
  for (const s of counted) perFile[s.file] = (perFile[s.file] || 0) + 1;
  return { sites, counted, perFile, total: counted.length };
}

function corpus(root) {
  return walk(join(root, 'src'))
    .map((p) => relative(root, p).replace(/\\/g, '/'))
    .filter((rel) => /\.(js|css)$/.test(rel) && !rel.startsWith('src/features/smoke/') && rel !== 'src/features/smoke-test.js')
    .map((rel) => [rel, readFileSync(join(root, rel), 'utf8')]);
}

function compare(now, base) {
  const fails = [], notes = [];
  if (now.total > base.total) fails.push(`total full-screen layers not on the primitive rose ${base.total} → ${now.total}`);
  for (const [f, n] of Object.entries(now.perFile)) {
    const was = base.files[f] || 0;
    if (n > was) fails.push(`${f}: ${was} → ${n}`);
  }
  for (const [f, was] of Object.entries(base.files)) {
    const n = now.perFile[f] || 0;
    if (n < was) notes.push(`${f}: ${was} → ${n} — paid down; run --write to lower the ceiling`);
  }
  return { fails, notes };
}

export function run(argv = []) {
  const now = census(corpus(ROOT));
  if (argv.includes('--write')) {
    writeFileSync(BASELINE, JSON.stringify({
      _why: 'CEILINGS, not targets. Full-viewport fixed layers under src/ that do not use the .hr-scrim/.hr-sheet primitive. '
        + 'The total and each file may only fall. Regenerated by `node tests/modal-primitive-census.mjs --write` after a paydown — never to make a red build green (CLAUDE.md §2).',
      measured: new Date().toISOString().slice(0, 10),
      total: now.total,
      files: Object.fromEntries(Object.entries(now.perFile).sort()),
    }, null, 2) + '\n');
    console.log(`✓ modal-primitive census written: ${now.total} layer(s) off the primitive → tests/modal-primitive-census.baseline.json`);
    return 0;
  }
  if (!existsSync(BASELINE)) { console.error('MODAL CENSUS: no baseline. Run --write once.'); return 2; }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const { fails, notes } = compare(now, base);
  if (argv.includes('--report')) {
    for (const s of now.sites) console.log(`  ${s.allowed ? 'allow' : 'count'}  ${s.file}:${s.line}  ${s.text}${s.allowed ? '   — ' + s.allowed : ''}`);
  }
  if (fails.length) {
    console.error(`  ✗ modal-primitive census: ${fails.length} count(s) ROSE`);
    for (const f of fails) console.error('      ' + f);
    for (const s of now.counted.filter((x) => (base.files[x.file] || 0) < now.perFile[x.file])) console.error(`        ${s.file}:${s.line}  ${s.text}`);
    console.error('\n  A new full-screen layer must be a sheet: class `hr-scrim` on the layer, `hr-sheet` on the card,');
    console.error('  head/body/foot inside it, and no position/inset/Nvh of its own (src/styles/art-direction.css).');
    return 1;
  }
  console.log(`✓ modal-primitive census: ${now.total} full-screen layer(s) off the primitive (ceiling ${base.total}), `
    + `${now.sites.length - now.total} allowlisted — none new`);
  for (const n of notes) console.log('      ' + n);
  return 0;
}

/* ── MUTATION PROOF ────────────────────────────────────────────────────── */
function selftest() {
  const files = corpus(ROOT);
  const base = census(files);
  const baseline = { total: base.total, files: base.perFile };
  const fails = [];
  const plant = (rel, extra) => {
    const next = files.map(([f, s]) => [f, f === rel ? s + extra : s]);
    if (!next.some(([f]) => f === rel)) next.push([rel, extra]);
    return compare(census(next), baseline).fails.length;
  };
  const RED = [
    ['a CSS rule', 'src/styles/legacy.css', '\n.x-planted{position:fixed;inset:0;z-index:5}\n'],
    ['a CSS rule with four zero edges', 'src/styles/theme-cozy.css', '\n.x-planted{position: fixed; top: 0; left: 0; right: 0; bottom: 0}\n'],
    ['an inline cssText', 'src/features/muster.js', "\nel.style.cssText = 'position:fixed;inset:0;z-index:9';\n"],
    ['an injected <style> string', 'src/features/renown.js', "\nvar s = '.x-planted{position:fixed;inset:0;z-index:9}';\n"],
    ['the array-joined form', 'src/net/accrue.js', "\nel.style.cssText = ['position:fixed', 'inset:0', 'z-index:9'].join(';');\n"],
    ['a brand-new file', 'src/features/x-planted.js', "el.style.cssText = 'position:fixed;inset:0';\n"],
  ];
  for (const [what, rel, extra] of RED) if (!plant(rel, extra)) fails.push(`${what} (${rel}) was NOT caught`);
  const SILENT = [
    ['a layer on the primitive', 'src/styles/legacy.css', '\n.x-planted.hr-scrim{position:fixed;inset:0}\n'],
    ['a JS layer naming hr-scrim', 'src/features/muster.js', "\nel.className = 'hr-scrim'; el.style.cssText = 'position:fixed;inset:0';\n"],
    ['a commented-out CSS layer', 'src/styles/legacy.css', '\n/* .x-planted{position:fixed;inset:0} */\n'],
    ['a // comment', 'src/features/muster.js', '\n  // position:fixed; inset:0 is what the scrim does\n'],
    ['a fixed element that is not full-screen', 'src/styles/legacy.css', '\n.x-planted{position:fixed;left:0;bottom:0;width:40px}\n'],
    ['an inset that is not zero', 'src/styles/legacy.css', '\n.x-planted{position:fixed;inset:0.5rem}\n'],
  ];
  for (const [what, rel, extra] of SILENT) if (plant(rel, extra)) fails.push(`${what} (${rel}) was counted — false positive`);
  if (compare(base, baseline).fails.length) fails.push('the unmodified tree is not clean against itself');
  if (!base.sites.some((s) => s.allowed)) fails.push('no allowlisted site matched — every needle has gone stale');
  const stale = ALLOWLIST.filter((a) => !base.sites.some((s) => s.file === a.file && s.allowed === a.why));
  if (stale.length) fails.push('allowlist entries that match nothing (remove them): ' + stale.map((a) => a.file + ' ' + a.needle).join(', '));
  if (fails.length) { for (const f of fails) console.error('  ✗ SELFTEST: ' + f); return 1; }
  console.log(`✓ modal-primitive census --selftest: ${RED.length} planted layers caught (CSS, four-edge CSS, cssText, `
    + `<style> string, array-joined, new file); ${SILENT.length} negative controls silent (primitive, hr-scrim-named, `
    + 'comments ×2, non-full-screen fixed, non-zero inset); allowlist live');
  return 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/modal-primitive-census.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : run(process.argv.slice(2)));
}
