#!/usr/bin/env node
// tests/_chrome.mjs — the ONE place a page runner picks its Chromium (b561).
//
//   HR_CHROME unset       → Playwright's own download (CI)
//   HR_CHROME=<existing>  → that executable (a sandbox with a preinstalled build)
//   HR_CHROME=<missing>   → exit 1, one line naming the path; no Playwright stack
//
//   node tests/_chrome.mjs             # print what a runner would launch
//   node tests/_chrome.mjs --selftest  # the three arms above, asserted
// mutant-anchors: none — the proof plants HR_CHROME values into a child process, never a tree file
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

export function chromePath(env = process.env, exists = existsSync) {
  const p = env.HR_CHROME;
  if (!p) return undefined;
  if (!exists(p)) throw new Error(`HR_CHROME=${p} does not exist — unset it to use Playwright's Chromium, or point it at a chrome binary`);
  return p;
}

export function launchOptions(extra = {}, env = process.env, exists = existsSync) {
  let p;
  try { p = chromePath(env, exists); }
  catch (e) { console.error(`✗ ${e.message}`); process.exit(1); }
  return p ? { ...extra, executablePath: p } : { ...extra };
}

/* ONE CHROMIUM PER RUN (2026-10-20). A page runner's --mutate arm calls its checks
   once per mutant, and each call launched (and closed) its own browser. Each call
   now LEASES the run's one browser. Isolation is the context — browser.newContext()
   has its own cookies, storage, HTTP cache and service workers — which every runner
   already opens per page; a lease's close() closes exactly the contexts it opened.
   A browser that died is relaunched. It goes down with the process: Playwright kills
   the browsers it launched on exit, and every runner ends in process.exit. */
let shared = null;
export async function leaseBrowser(chromium, extra = { headless: true }) {
  let browser = shared && await shared.catch(() => null);
  if (!browser || !browser.isConnected()) {
    shared = chromium.launch(launchOptions(extra));
    browser = await shared;
  }
  const mine = new Set();
  return {
    newContext: async (o) => { const c = await browser.newContext(o); mine.add(c); return c; },
    close: async () => { for (const c of mine) await c.close().catch(() => {}); mine.clear(); },
  };
}

function selftest() {
  const fails = [];
  const check = (name, ok, got) => { console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — got ${got}`}`); if (!ok) fails.push(name); };

  const a = launchOptions({ headless: true }, {});
  check('A unset → Playwright default (no executablePath)', !('executablePath' in a) && a.headless === true, JSON.stringify(a));

  const b = launchOptions({}, { HR_CHROME: process.execPath });
  check('B valid path → that path is used', b.executablePath === process.execPath, JSON.stringify(b));

  const bogus = '/nonexistent/hr-chrome-selftest/chrome';
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)],
    { env: { ...process.env, HR_CHROME: bogus }, encoding: 'utf8' });
  const err = (r.stderr || '').trim();
  check('C invalid path → exit 1, one line naming the path',
    r.status === 1 && err.includes(bogus) && err.split('\n').length === 1 && !/\bat \S+:\d+/.test(err),
    `status=${r.status} stderr=${JSON.stringify(err)}`);

  console.log(fails.length ? `✗ _chrome selftest: ${fails.length} arm(s) failed` : '✓ _chrome selftest: 3/3 arms hold');
  process.exit(fails.length ? 1 : 0);
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) selftest();
  const o = launchOptions();
  console.log(`✓ chromium: ${o.executablePath || "Playwright's default"}`);
}
