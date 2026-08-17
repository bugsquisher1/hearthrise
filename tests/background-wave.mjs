// ============================================================
// tests/background-wave.mjs — guards the COMBAT-UI-17 painted backdrops.
//
// The smoke suite cannot see a picture (no render-guard here), but it CAN
// prove the three things a bad wiring pass would silently get wrong:
//
//  1. every bg_*.jpg the CSS references actually exists on disk and is
//     under the 180 KB budget — an asset guard, not a render guard;
//  2. the class set MONSTERS actually uses is a SUBSET of what
//     combat-screens.css keys on — a new monster class ships with no
//     backdrop and no failure, silently falling back to dungeon.jpg (which
//     is fine for a deliberately-unshipped class like `demon`, but NOT fine
//     for a class nobody wired at all);
//  3. dungeon.jpg's old layered rules (art-direction.css / audit-overrides.css
//     / theme-cozy.css) are GONE — the b361-style stacked-scrim regression
//     this wave exists to fix cannot come back silently.
//
// Run standalone: node tests/background-wave.mjs
// ============================================================

import fs from 'fs';
import path from 'path';
import url from 'url';
import { MONSTERS } from '../src/data/monsters.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const MAX_BYTES = 180 * 1024;

// Classes with a shipped plate (bg_combat_demon was rejected at QC — a
// visible artist signature mark — so `demon` is deliberately absent here and
// falls back to dungeon.jpg; that is a known, documented gap, not a bug).
const WIRED_CLASSES = [
  'vermin', 'mammal', 'plant', 'humanoid', 'human', 'undead',
  'dragon', 'elemental', 'construct', 'extradimensional',
];
const KNOWN_UNWIRED_CLASSES = ['demon'];

export function backgroundWaveGuard() {
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };

  const bgDir = path.join(ROOT, 'assets', 'icons-bundle', 'backgrounds');

  // ── 1. every shipped plate exists and is within budget ──────────────────
  for (const cls of WIRED_CLASSES) {
    const p = path.join(bgDir, `bg_combat_${cls}.jpg`);
    ok(fs.existsSync(p), `BG-1 bg_combat_${cls}.jpg missing at ${p}`);
    if (fs.existsSync(p)) {
      const size = fs.statSync(p).size;
      ok(size <= MAX_BYTES, `BG-1 bg_combat_${cls}.jpg is ${(size / 1024).toFixed(1)}KB, over the 180KB budget`);
      ok(size > 0, `BG-1 bg_combat_${cls}.jpg is empty`);
    }
  }
  for (const [id, jpg] of [
    ['skills craft-hall', 'bg_skills_crafthall.jpg'],
    ['bounty board wall', 'bg_board_wall.jpg'],
  ]) {
    const p = path.join(bgDir, jpg);
    ok(fs.existsSync(p), `BG-2 ${id} (${jpg}) missing at ${p}`);
    if (fs.existsSync(p)) {
      const size = fs.statSync(p).size;
      ok(size <= MAX_BYTES, `BG-2 ${jpg} is ${(size / 1024).toFixed(1)}KB, over the 180KB budget`);
    }
  }
  // dungeon.jpg is still the fallback for unwired/rejected classes — must ship.
  ok(fs.existsSync(path.join(bgDir, 'dungeon.jpg')), 'BG-3 dungeon.jpg (fallback) missing');

  // b371 no-leading-underscore guard: none of the shipped names should start
  // with an underscore (that convention marks scratch/unshipped files).
  for (const f of fs.readdirSync(bgDir)) {
    ok(!f.startsWith('_'), `BG-4 ${f} has a leading underscore — scratch files must not ship`);
  }

  // ── 2. every live monster class is accounted for ────────────────────────
  const liveClasses = new Set(Object.values(MONSTERS).map((m) => m.cls).filter(Boolean));
  const accountedFor = new Set([...WIRED_CLASSES, ...KNOWN_UNWIRED_CLASSES]);
  for (const cls of liveClasses) {
    ok(accountedFor.has(cls), `BG-5 monster class "${cls}" is not in WIRED_CLASSES or KNOWN_UNWIRED_CLASSES in this guard — it will silently fall back to dungeon.jpg with no record of why`);
  }
  // and the reverse: don't carry a wired class nothing uses (dead weight)
  for (const cls of WIRED_CLASSES) {
    ok(liveClasses.has(cls), `BG-6 "${cls}" has a shipped plate but no monster uses that class — dead asset, or monsters.js changed under this guard`);
  }

  // ── 3. combat-screens.css actually keys on data-foe-class for each wired class,
  //     and the deleted-layer sheets stay deleted ─────────────────────────
  const combatCss = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'combat-screens.css'), 'utf8');
  for (const cls of WIRED_CLASSES) {
    const needle = `data-foe-class="${cls}"`;
    ok(combatCss.includes(needle), `BG-7 combat-screens.css has no rule keyed on ${needle}`);
  }

  for (const [file, mustNotContain] of [
    ['art-direction.css', "url('../../assets/icons-bundle/backgrounds/dungeon.jpg')"],
    ['audit-overrides.css', "url('../../assets/icons-bundle/backgrounds/dungeon.jpg')"],
    ['theme-cozy.css', "url('../../assets/icons-bundle/backgrounds/dungeon.jpg')"],
  ]) {
    const css = fs.readFileSync(path.join(ROOT, 'src', 'styles', file), 'utf8');
    ok(!css.includes(mustNotContain), `BG-8 ${file} still references dungeon.jpg directly — the stacked-scrim regression this wave fixed (b361-style) is back. combat-screens.css should be the ONLY sheet painting .combat-arena's background-image.`);
  }

  return { ok: fails.length === 0, fails };
}

const isMain = process.argv[1] && url.pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const r = backgroundWaveGuard();
  if (r.ok) {
    console.log('background-wave: PASS');
    process.exit(0);
  } else {
    console.error('background-wave: FAIL');
    r.fails.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
}
