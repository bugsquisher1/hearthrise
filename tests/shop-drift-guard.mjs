#!/usr/bin/env node
// ============================================================================
// tests/shop-drift-guard.mjs — PROVE THE PRICE GUARD CAN SEE DRIFT
//
// WHY THIS EXISTS
//   src/data/shops.js is a SECOND COPY of every price in the game. A second
//   copy is only defensible while something proves it is not diverging, and
//   that something is `node tools/gen-shops.mjs --check`, run as a preflight
//   by tests/run-smoke.mjs.
//
//   But a drift guard that cannot see drift is this repo's signature failure —
//   the "assertion that asserts nothing" family, at instance #15 and counting.
//   `--check` passing tells you nothing on its own: it would also pass if the
//   extraction silently produced nothing, if the anchors quietly missed, or if
//   the comparison were between two copies of the same mistake.
//
//   So this file mutates the REAL sources, one thing at a time, and asserts
//   the guard goes RED for each. Every mutation is preceded by a control run
//   that must be GREEN — a harness that cannot show the un-mutated state is
//   not showing anything.
//
// HOW IT AVOIDS TOUCHING THE REPO
//   It copies src/ and tools/ into a temp directory and mutates THERE.
//   gen-shops.mjs resolves its own ROOT from import.meta.url, so the copied
//   generator reads the copied tree. src/legacy.js on disk is never written.
//   That matters beyond tidiness: an interrupted in-place mutate-and-revert
//   leaves a wrong price in the file that authors the economy.
//
// Run standalone:  node tests/shop-drift-guard.mjs
// ============================================================================

import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const WORK = mkdtempSync(join(tmpdir(), 'hr-shop-drift-'));

cpSync(join(REPO, 'src'), join(WORK, 'src'), { recursive: true });
cpSync(join(REPO, 'tools'), join(WORK, 'tools'), { recursive: true });

const GEN = join(WORK, 'tools', 'gen-shops.mjs');
const LEGACY = join(WORK, 'src', 'legacy.js');
const SHOPS = join(WORK, 'src', 'data', 'shops.js');
const WORKERS = join(WORK, 'src', 'features', 'workers.js');

const check = () => {
  const r = spawnSync(process.execPath, [GEN, '--check'], { encoding: 'utf8' });
  return { code: r.status, out: ((r.stdout || '') + (r.stderr || '')).trim() };
};

const QUIET = !process.argv.includes('--verbose');
const say = (s) => { if (!QUIET) console.log(s); };

let failures = 0;
function mutation(label, file, from, to) {
  const before = check();
  if (before.code !== 0) {
    console.error(`shop-drift-guard: CONTROL NOT GREEN before "${label}" — the harness is broken, `
      + `not the guard.\n${before.out}`);
    failures++;
    return;
  }
  const orig = readFileSync(file, 'utf8');
  const hits = orig.split(from).length - 1;
  if (hits !== 1) {
    console.error(`shop-drift-guard: mutation "${label}" anchors on a pattern that occurs ${hits}× `
      + '— a mutation that cannot be applied proves nothing. Update the harness.');
    failures++;
    return;
  }
  writeFileSync(file, orig.replace(from, to), 'utf8');
  const after = check();
  writeFileSync(file, orig, 'utf8');
  const restored = check();

  if (after.code === 0) {
    console.error(`shop-drift-guard: ✘ "${label}" — the guard STAYED GREEN. It is blind to this drift.`);
    failures++;
  } else {
    say(`  ✔ ${label}\n      ${after.out.split('\n')[0]}`);
  }
  if (restored.code !== 0) {
    console.error(`shop-drift-guard: revert of "${label}" did not restore green — harness corrupted.`);
    failures++;
  }
}

// The line endings matter: legacy.js is checked out CRLF on Windows and LF on
// CI, so every legacy.js pattern below is deliberately single-line.
mutation('a gold price edited in legacy.js (EQUIP_SHOP bronze_sword 100 → 101)',
  LEGACY, "{id:'bronze_sword',cost:100}", "{id:'bronze_sword',cost:101}");

mutation('a room rung price edited in legacy.js (Kitchen L1 gold 500 → 501)',
  LEGACY, 'cost:{gold:500,normal_log:20}', 'cost:{gold:501,normal_log:20}');

mutation('a MATERIAL quantity edited in legacy.js (Kitchen L1 normal_log 20 → 21)',
  LEGACY, 'cost:{gold:500,normal_log:20}', 'cost:{gold:500,normal_log:21}');

mutation('a price edited OUTSIDE legacy.js (workers HIRE_COSTS 500 → 600)',
  WORKERS, 'var HIRE_COSTS = [500,', 'var HIRE_COSTS = [600,');

mutation('the GENERATED file hand-edited (shops.js seed.turnip_seed 50 → 60)',
  SHOPS, '{ kind: "currency", id: "gold", amount: 50 }],\n    grant: [{ kind: "item", id: "turnip_seed", amount: 10 }]',
  '{ kind: "currency", id: "gold", amount: 60 }],\n    grant: [{ kind: "item", id: "turnip_seed", amount: 10 }]');

mutation('a whole table RENAMED (the anchor tripwire, not a silent empty table)',
  LEGACY, 'const EQUIP_SHOP=[', 'const EQUIP_SHOP_V2=[');

mutation('a cost item id typo\'d (an unknown id would silently price nothing)',
  LEGACY, 'cost:{gold:900,bones:40}', 'cost:{gold:900,bone:40}');

// The empty-table tripwire is the one that matters most: without it an anchor
// that stopped matching would produce an empty table, which diffs clean
// against an empty committed file and reports "in sync" forever.
mutation('a table EMPTIED (the empty-table tripwire)',
  LEGACY, 'const BOUNTY_SHOP = [', 'const BOUNTY_SHOP = []; const _OLD_BOUNTY_SHOP = [');

rmSync(WORK, { recursive: true, force: true });

if (failures) {
  console.error(`\nShop drift guard — ${failures} FAILED. The price catalogue is not protected.`);
  process.exit(1);
}
console.log('Shop drift guard — 8 mutations, all RED; each preceded by a GREEN control.');
