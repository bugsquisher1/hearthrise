#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/visual-qa-gate.mjs — THE PLAYER'S-EYE PASS, WITH TEETH (cleanup slice 1)
//
//   node tests/visual-qa-gate.mjs             run visual-qa and gate on it
//   node tests/visual-qa-gate.mjs --report    …and print the full diff
//   node tests/visual-qa-gate.mjs --write     accept today's findings as baseline
//   node tests/visual-qa-gate.mjs --selftest  mutation proof (no browser needed)
//
// ── WHY ─────────────────────────────────────────────────────────────────────
// tests/visual-qa.mjs walks every screen at desktop and landscape-phone size and
// measures the things a player notices in the first second — clipped text,
// content under a fixed bar, tiny tap targets, emoji used as artwork, dead
// controls. Its own header says it: "Exit code is always 0 — this is a REPORT,
// not a gate." So for 200-odd builds it has been possible to add a clipped
// heading and ship, and the only cost was a line in a JSON file nobody diffs.
// The visual gate in CLAUDE.md §3.3 is a HUMAN reading screenshots; that gate is
// real but it is not automatic, and b361 is the proof that per-branch looking
// misses emergent breakage.
//
// This wraps the report in the narrowest gate that is still honest:
//
//   FAILS on  · any P0 or ERR finding (a sweep that threw, a runtime error, a
//               severity the sweep reserves for "this screen is broken")
//             · any P1 finding on a (screen, viewport, kind, selector) key that
//               is NOT in the committed baseline — i.e. a NEW place where text
//               is clipped or content hides under a bar
//
//   DOES NOT FAIL on · the 100-odd P1s already in the baseline. They are real
//               debt and they are the next slices' work; failing on them today
//               would mean deleting the guard by Tuesday.
//             · P2/P3 (small targets, duplicate words) — reported, never red.
//             · TEXT or PIXEL deltas on a key that already exists. "(185>135)"
//               becoming "(186>135)" is not a regression, and a guard that goes
//               red on a copy edit is a guard people learn to ignore.
//             · a finding disappearing. That is a fix; it prints as a note and
//               the baseline is re-recorded with --write.
//
// ── ONE DELIBERATE EXCLUSION, DECLARED HERE ─────────────────────────────────
// `.hr-desktopmode-banner` is excluded from the comparison entirely. All 84
// `under-fixed-bar` findings in today's baseline are content sitting under that
// banner, and the banner is an ENVIRONMENTAL artifact of the harness — it is the
// "you are in desktop mode" strip, which a signed-in player on a real device
// does not see in the same state. Gating on it would mean the guard's loudest
// signal is a thing no player experiences. The exclusion is by selector AND by
// detail text, because the sweep names the bar in the detail rather than the el.
// If that banner ever becomes real chrome, delete the EXCLUDE list and re-record.
//
// Exit: 0 green (or green-with-notes) · 1 a P0 or a NEW P1 · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const FINDINGS = join(ROOT, 'docs', 'reports', 'visual-qa', 'findings.json');

/* The environmental exclusion. Matched against BOTH the `el` selector and the
   `detail` string of every finding. Keep this list short and justified. */
export const EXCLUDE = ['.hr-desktopmode-banner', 'hr-desktopmode-banner'];

const FAIL_SEV = new Set(['P0', 'ERR']);

/* THE KEY. (screen, viewport, kind, selector) — deliberately NOT the detail,
   so a pixel count or a copy change on a known finding is not a new finding. */
export const keyOf = (screen, viewport, i) => `${screen}|${viewport}|${i.kind}|${i.el || ''}`;

const excluded = (i) => EXCLUDE.some((x) => String(i.el || '').includes(x) || String(i.detail || '').includes(x));

/** Flatten a findings.json array into { key -> issue } plus the hard failures. */
export function index(findings) {
  const keys = new Map();
  const hard = [];
  for (const f of findings || []) {
    for (const i of f.issues || []) {
      if (excluded(i)) continue;
      const k = keyOf(f.screen, f.viewport, i);
      if (FAIL_SEV.has(i.sev)) hard.push({ key: k, ...i, screen: f.screen, viewport: f.viewport });
      if (!keys.has(k)) keys.set(k, { ...i, screen: f.screen, viewport: f.viewport });
    }
  }
  return { keys, hard };
}

/** The whole comparison, as a pure function — this is what --selftest exercises. */
export function compare(current, baseline) {
  const cur = index(current);
  const base = index(baseline);
  const fails = [];
  const notes = [];

  for (const h of cur.hard) fails.push(`${h.sev} ${h.screen}/${h.viewport} ${h.kind}: ${h.detail || ''} ${h.el || ''}`.trim());

  for (const [k, i] of cur.keys) {
    if (i.sev !== 'P1') continue;
    if (!base.keys.has(k)) fails.push(`NEW P1 ${i.screen}/${i.viewport} ${i.kind}: ${i.detail || ''} ${i.el || ''}`.trim());
  }
  for (const [k, i] of base.keys) {
    if (!cur.keys.has(k)) notes.push(`fixed: ${i.sev} ${i.screen}/${i.viewport} ${i.kind} ${i.el || ''}`);
  }
  for (const [k, i] of cur.keys) {
    const b = base.keys.get(k);
    if (b && b.sev !== i.sev && i.sev !== 'P1') notes.push(`severity ${b.sev}→${i.sev} on ${k}`);
  }
  return { fails, notes, counts: { current: cur.keys.size, baseline: base.keys.size } };
}

function readJson(p) { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } }

function main(argv) {
  const WRITE = argv.includes('--write');
  const baselineRaw = existsSync(FINDINGS) ? readFileSync(FINDINGS) : null;
  const baseline = readJson(FINDINGS);
  if (!baseline && !WRITE) {
    console.error('VISUAL-GATE: no committed baseline at docs/reports/visual-qa/findings.json.');
    console.error('  Run `node tests/visual-qa-gate.mjs --write` once and commit the result.');
    return 2;
  }

  // visual-qa.mjs OVERWRITES findings.json, so the baseline is held in memory and
  // restored afterwards unless --write. Anything else and the gate compares the
  // run against itself and is green forever.
  const pass = argv.filter((a) => !['--write', '--report', '--selftest'].includes(a));
  const r = spawnSync(process.execPath, [join(ROOT, 'tests', 'visual-qa.mjs'), ...pass],
    { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    if (baselineRaw) writeFileSync(FINDINGS, baselineRaw);
    console.error('VISUAL-GATE: tests/visual-qa.mjs did not complete — ' + (r.error?.message || `exit ${r.status}`));
    console.error('  That is a HARNESS problem (missing Chromium, port in use), not a visual verdict.');
    return 2;
  }
  const current = readJson(FINDINGS);
  if (!Array.isArray(current)) {
    if (baselineRaw) writeFileSync(FINDINGS, baselineRaw);
    console.error('VISUAL-GATE: findings.json was not written as an array.');
    return 2;
  }

  if (WRITE) {
    const { fails, notes } = compare(current, baseline || []);
    console.log(`\n✓ visual-qa baseline recorded (${index(current).keys.size} comparable findings, `
      + `.hr-desktopmode-banner excluded). Was: ${fails.length} would-be failure(s), ${notes.length} fix(es).`);
    return 0;
  }

  const { fails, notes, counts } = compare(current, baseline);
  writeFileSync(FINDINGS, baselineRaw);   // byte-for-byte: the baseline stays the baseline
  console.log(`\n${''.padEnd(70, '-')}`);
  if (fails.length) {
    console.error(`  ✗ visual gate: ${fails.length} P0/new-P1 finding(s)`);
    for (const f of fails) console.error('      ' + f);
    console.error('\n  A NEW clipped heading or a NEW block of content under a fixed bar is a player-');
    console.error('  visible regression on a rendered screen. Fix the layout. If the finding is a');
    console.error('  false positive, say why in tests/visual-qa.mjs\'s sweep — do not widen EXCLUDE');
    console.error('  without a written reason.');
    if (argv.includes('--report')) for (const n of notes) console.log('      note: ' + n);
    return 1;
  }
  console.log(`✓ visual gate: no P0, no new P1 (${counts.current} comparable findings vs `
    + `${counts.baseline} in the baseline; .hr-desktopmode-banner excluded as environmental)`);
  if (notes.length) {
    console.log(`  ${notes.length} baseline finding(s) no longer reproduce — run --write to bank the fixes:`);
    for (const n of notes.slice(0, 10)) console.log('      ' + n);
  }
  return 0;
}

/* ── MUTATION PROOF (no browser: the comparison IS the guard) ────────────── */
function selftest() {
  const fails = [];
  const F = (screen, viewport, issues) => ({ screen, viewport, issues, stats: {} });
  const base = [
    F('combat', 'desktop', [
      { sev: 'P1', kind: 'clipped-text', detail: '"The Crownless Wyrm" (185>135)', el: '.wt-dest>b' },
      { sev: 'P1', kind: 'under-fixed-bar', detail: '"Gold" 12px under .hr-desktopmode-banner', el: '#top-gold' },
      { sev: 'P3', kind: 'small-target', detail: '11 controls <44px', el: '.panel' },
    ]),
  ];
  const ok = (label, cur, want) => {
    const r = compare(cur, base);
    const red = r.fails.length > 0;
    if (red !== want) fails.push(`SELFTEST: ${label} — expected ${want ? 'RED' : 'GREEN'}, got ${red ? 'RED' : 'GREEN'} (${JSON.stringify(r.fails)})`);
    return r;
  };

  // the control: the baseline against itself is green
  ok('baseline vs itself', base, false);

  // 1. a P0 anywhere is red
  ok('a P0 finding', [F('combat', 'desktop', [{ sev: 'P0', kind: 'emoji-as-art', detail: '🔥', el: '.x' }])], true);
  // 2. a sweep that threw is red
  ok('an ERR (sweep-threw)', [F('shops', 'desktop', [{ sev: 'ERR', kind: 'sweep-threw', detail: 'boom', el: '' }])], true);
  // 3. a NEW P1 selector is red
  ok('a new P1 selector', [F('combat', 'desktop', [
    { sev: 'P1', kind: 'clipped-text', detail: 'x', el: '.wt-dest>b' },
    { sev: 'P1', kind: 'clipped-text', detail: 'y', el: '.brand-new>h2' }])], true);
  // 4. the SAME P1 on a NEW screen is red (the key carries the screen)
  ok('a known P1 kind appearing on another screen', [F('clan', 'desktop', [
    { sev: 'P1', kind: 'clipped-text', detail: 'x', el: '.wt-dest>b' }])], true);
  // 5. the same P1 at another VIEWPORT is red (the key carries the viewport)
  ok('a known P1 appearing at landscape', [F('combat', 'landscape', [
    { sev: 'P1', kind: 'clipped-text', detail: 'x', el: '.wt-dest>b' }])], true);
  // 6. a TEXT/PIXEL delta on a known key is GREEN — the whole point of the key
  ok('a pixel/copy delta on a known P1', [F('combat', 'desktop', [
    { sev: 'P1', kind: 'clipped-text', detail: '"The Crownless Wyrm" (186>135)', el: '.wt-dest>b' }])], false);
  // 7. a NEW P2/P3 is GREEN — reported, never red
  ok('a new P3 small-target', [F('combat', 'desktop', [
    { sev: 'P3', kind: 'small-target', detail: 'z', el: '.something-new' }])], false);
  // 8. a NEW under-fixed-bar UNDER THE EXCLUDED BANNER is GREEN
  ok('a new finding under .hr-desktopmode-banner', [F('shops', 'landscape', [
    { sev: 'P1', kind: 'under-fixed-bar', detail: '"Buy" 9px under .hr-desktopmode-banner', el: '#btn-buy' }])], false);
  // 9. …but the SAME kind under a REAL bar is RED (the exclusion is not a hole)
  ok('a new finding under a real fixed bar', [F('shops', 'landscape', [
    { sev: 'P1', kind: 'under-fixed-bar', detail: '"Buy" 9px under .topbar', el: '#btn-buy' }])], true);
  // 10. a fix is a NOTE, not a failure
  const r10 = ok('a baseline finding disappearing', [F('combat', 'desktop', [
    { sev: 'P3', kind: 'small-target', detail: '11 controls <44px', el: '.panel' }])], false);
  if (!r10.notes.some((n) => n.startsWith('fixed:'))) fails.push('SELFTEST: a disappeared finding produced no "fixed:" note');
  // 11. an EMPTY report must not be silently green-and-perfect: it is all-fixed notes
  const r11 = compare([], base);
  if (r11.fails.length) fails.push('SELFTEST: an empty report failed rather than noting every finding as fixed');
  if (r11.notes.length < 2) fails.push('SELFTEST: an empty report did not note the baseline findings as fixed');

  // the committed baseline must actually parse and index
  if (existsSync(FINDINGS)) {
    const real = readJson(FINDINGS);
    if (!Array.isArray(real)) fails.push('SELFTEST: the committed findings.json is not an array');
    else {
      const idx = index(real);
      if (idx.hard.length) fails.push(`SELFTEST: the committed baseline already contains ${idx.hard.length} P0/ERR finding(s) — the gate would be red on its own baseline`);
      if (!idx.keys.size) fails.push('SELFTEST: the committed baseline indexes to zero comparable findings — the exclusion is swallowing everything');
    }
  }

  if (fails.length) { for (const f of fails) console.error('  ✗ ' + f); return 1; }
  console.log('✓ visual-qa-gate --selftest: 11 comparison cases — P0/ERR and new-P1 keys red; '
    + 'pixel/copy deltas, new P2/P3 and .hr-desktopmode-banner findings green; fixes are notes; '
    + 'committed baseline indexes clean');
  return 0;
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tests/visual-qa-gate.mjs')) {
  process.exit(process.argv.includes('--selftest') ? selftest() : main(process.argv.slice(2)));
}
