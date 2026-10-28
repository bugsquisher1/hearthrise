// art/review/opt-review-2026-10-28/perf-variant.mjs — tests/perf-budget.mjs --measure, with three measurement-only
// additions, run from a temporary copy so the guard itself is never edited:
//   · OPT_CPU=<n>   Chromium CPU throttling (CDP Emulation.setCPUThrottlingRate) for the whole run (phone 4x)
//   · boot timing   page.goto -> sign-in form -> character list -> hunt view, ms (stubbed server, no network latency)
//   · call counts   every Supabase call the page made, by RPC/function name, over the run (requests per minute)
//
//   OPT_CPU=4 node art/review/opt-review-2026-10-28/perf-variant.mjs --measure --browsers chromium --sizes 922x423 --minutes 10 --dump out.json
//
// The copy is written next to the original (tests/.opt-perf-variant.tmp.mjs, so its relative imports resolve) and
// deleted on exit. Measurement-only (lane/r-opt-review); never a gate.
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'tests/perf-budget.mjs');
const TMP = join(ROOT, 'tests/.opt-perf-variant.tmp.mjs');
let src = readFileSync(SRC, 'utf8');
const patch = (from, to) => { if (!src.includes(from)) { console.error('perf-variant: anchor not found: ' + from.slice(0, 80)); process.exit(2); } src = src.replace(from, to); };

patch("    const cdp = o.browser === 'chromium' ? await ctx.newCDPSession(page) : null;\n",
  "    const cdp = o.browser === 'chromium' ? await ctx.newCDPSession(page) : null;\n" +
  "    const __opt = { cpu: Number(process.env.OPT_CPU || 1), calls: Object.create(null), boot: {} }; (globalThis.__opt = globalThis.__opt || []).push(__opt);\n" +
  "    if (cdp && __opt.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: __opt.cpu });\n");
patch("      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(srv.answer(name, args)) });",
  "      { const __o = globalThis.__opt[globalThis.__opt.length - 1]; const __k = name + (args && args.op ? ':' + args.op : '') + (args && args.verb ? ':' + args.verb : ''); __o.calls[__k] = (__o.calls[__k] || 0) + 1; }\n" +
  "      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(srv.answer(name, args)) });");
patch("    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });\n",
  "    const __b0 = Date.now();\n    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });\n" +
  "    globalThis.__opt[globalThis.__opt.length - 1].boot.load_ms = Date.now() - __b0;\n");
patch("    await page.waitForSelector('[data-app=\"play\"][data-slot=\"0\"]');\n",
  "    await page.waitForSelector('[data-app=\"play\"][data-slot=\"0\"]');\n    globalThis.__opt[globalThis.__opt.length - 1].boot.characters_ms = Date.now() - __b0;\n    const __b1 = Date.now();\n");
patch("    await page.waitForSelector('.hs-launchers');\n",
  "    await page.waitForSelector('.hs-launchers');\n    { const __o = globalThis.__opt[globalThis.__opt.length - 1]; __o.boot.play_to_hunt_view_ms = Date.now() - __b1; __o.t0 = Date.now(); __o.calls = Object.create(null); }\n");
patch("      const m = await scenario({ browser, width, height, minutes, hiddenMs: 60000, overrides: planted() });\n",
  "      const m = await scenario({ browser, width, height, minutes, hiddenMs: 60000, overrides: planted() });\n" +
  "      { const __o = globalThis.__opt[globalThis.__opt.length - 1]; __o.run_minutes = +((Date.now() - __o.t0) / 60000).toFixed(2); m.opt = __o; console.log('   opt: ' + JSON.stringify(__o)); }\n");

writeFileSync(TMP, src);
try {
  const r = spawnSync(process.execPath, [TMP, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env, cwd: ROOT });
  process.exitCode = r.status ?? 1;
} finally { if (existsSync(TMP)) unlinkSync(TMP); }
