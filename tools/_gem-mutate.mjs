// ============================================================================
// tools/_gem-mutate.mjs — RED-WITHOUT-THE-FIX, proven rather than asserted.
//
// Reinstates each shipped defect this lane closes, one at a time, runs the real
// in-page suite, and requires the NAMED test to go red. A regression test that
// has never been seen to fail is a regression test nobody has verified.
//
// ⚠ IT EDITS src/legacy.js IN PLACE. Every mutation is restored in a `finally`
//   and the run ends by re-running the suite and reporting if the tree did not
//   come back green — but do not run it on a tree with uncommitted legacy.js
//   work you have not stashed, and do not run it concurrently with anything else
//   that writes that file. ~11 suite boots, roughly nine minutes.
//
// ⚠ EXPECT COLLATERAL REDS. A mutated tree makes GEM-OK-1 throw part-way, which
//   leaves the live page in a state a few later DOM tests (b231, b227) are
//   sensitive to. Those are reported as "also red" and are noise; the assertion
//   this harness makes is only ever about the NAMED test.
// ============================================================================
import { createServer } from 'node:http';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const at = (p) => join(ROOT, p);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

const LEGACY = 'src/legacy.js';

/** [name, mustGoRed, file, find, replaceWith] */
const MUTATIONS = [
  ['M1 buyTheme: the arm gate is removed (the shipped free-theme dupe)', 'GEM-REFUSE-1', LEGACY,
    "    if(!gemSpendIsClientAuthored()){refuseGemPurchase('that theme');return;}\n", ''],
  ['M2 buyCosmetic: the arm gate is removed', 'GEM-REFUSE-1', LEGACY,
    "  if(!gemSpendIsClientAuthored()){refuseGemPurchase('that cosmetic');return;}\n", ''],
  ['M3 buyBankSpaceGem: the arm gate is removed', 'GEM-REFUSE-1', LEGACY,
    "  if(!gemSpendIsClientAuthored()) return refuseGemPurchase('that bank expansion');\n", ''],
  ['M4 redeemHearthToken: the arm gate is removed (the token burn)', 'GEM-TOKEN-1', LEGACY,
    "  if(!gemSpendIsClientAuthored()){refuseGemPurchase('that Hearth Token redemption');return;}\n", ''],
  ['M5 ownership reverts to the RESIDUE read (the server no longer wins)', 'GEM-OWN-1', LEGACY,
    "  var srv=gemUnlockServerSet();\n  if(srv)return srv.indexOf(kind+':'+id)>=0;\n", ''],
  ['M6 setTheme re-derives ownership from residue instead of the seam', 'GEM-OWN-1', LEGACY,
    "function setTheme(id){if(!ownsGemUnlock('theme',id))return;",
    "function setTheme(id){if(!G.ownedThemes.includes(id))return;"],
  ['M7 buyCosmetic: the already-owned check is removed (double charge)', 'GEM-OK-1', LEGACY,
    "  if(ownsGemUnlock('cosmetic',id)){notify('That cosmetic is already yours.','info');return;}\n", ''],
  ['M8 buyTheme: the already-owned check is removed (double charge)', 'GEM-OK-1', LEGACY,
    "  if(ownsGemUnlock('theme',id)){ setTheme(id); return; }\n", ''],
  ['M9 buyCosmetic: the push is un-deduplicated (residue grows unbounded)', 'GEM-OK-1', LEGACY,
    "  if(G.ownedCosmetics.indexOf(id)<0)G.ownedCosmetics.push(id);",
    "  G.ownedCosmetics.push(id);"],
];

function serve() {
  return new Promise((resolve) => {
    const s = createServer(async (req, res) => {
      try {
        const u = decodeURIComponent((req.url || '/').split('?')[0]);
        let f = normalize(join(ROOT, u === '/' ? '/index.html' : u));
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const i = await stat(f).catch(() => null);
        if (i?.isDirectory()) f = join(f, 'index.html');
        res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(await readFile(f));
      } catch { res.writeHead(404).end(); }
    });
    s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
  });
}

async function runSuite(browser, port) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.addInitScript(() => { window.__HR_TEST_HARNESS__ = true; });
  try {
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof window.__smokeTest === 'function', { timeout: 60000 });
    await page.waitForTimeout(6000);
    return await page.evaluate(async () => {
      const s = await Promise.race([
        Promise.resolve(window.__smokeTest({ silent: true })),
        new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 300000)),
      ]);
      return {
        passed: s.passed, failed: s.failed, total: s.total, runtimeErrors: s.runtimeErrors,
        red: (s.results || []).filter((r) => r.status !== 'PASS').map((r) => ({ n: r.name, w: r.why })),
      };
    });
  } finally { await page.close(); }
}

const { server, port } = await serve();
const browser = await chromium.launch();
let bad = 0;
try {
  const base = await runSuite(browser, port);
  console.log(`baseline: ${base.passed}/${base.total} passed, ${base.failed} failed, ${base.runtimeErrors} runtime errors`);
  if (base.failed) { console.log('BASELINE IS RED — nothing below means anything:', JSON.stringify(base.red)); process.exit(1); }

  for (const [name, expect, file, find, repl] of MUTATIONS) {
    const p = at(file);
    const orig = await readFile(p, 'utf8');
    if (!orig.includes(find)) { console.log(`ANCHOR MISSING  ${name}`); bad++; continue; }
    await writeFile(p, orig.replace(find, repl), 'utf8');
    try {
      const r = await runSuite(browser, port);
      const hit = r.red.find((x) => x.n.indexOf(expect) === 0);
      const others = r.red.filter((x) => x.n.indexOf(expect) !== 0).map((x) => x.n);
      if (hit) {
        console.log(`RED    ${name}\n       -> ${expect}: ${String(hit.w).slice(0, 130)}`);
        if (others.length) console.log(`       (also red: ${others.join(' | ').slice(0, 160)})`);
      } else {
        bad++;
        console.log(`GREEN  ${name}\n       ESCAPED — ${expect} did not fail. red rows: ${JSON.stringify(r.red.map((x) => x.n))}`);
      }
    } finally { await writeFile(p, orig, 'utf8'); }
  }

  const after = await runSuite(browser, port);
  if (after.failed) { bad++; console.log('TREE NOT RESTORED:', JSON.stringify(after.red)); }
  else console.log(`\nrestored: ${after.passed}/${after.total} green`);
} finally { await browser.close(); server.close(); }
console.log(bad === 0 ? '\nMUTATION RUN OK — every reinstated defect turned its test RED' : `\nMUTATION RUN FAILED — ${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
