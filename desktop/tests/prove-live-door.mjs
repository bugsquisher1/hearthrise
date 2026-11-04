#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/prove-live-door.mjs — THE SHELL AGAINST THE LIVE SITE, UP TO THE SIGN-IN FORM. NO ACCOUNT, NOTHING TYPED.
//
//   node tests/prove-live-door.mjs [--bundle DIR]
//
// A real page load of https://hearthrise.net/play.html in the hidden shell: first launch (empty profile), second launch (the
// same profile, HTTP cache warm), and with --bundle the same origin answered from a built folder (option B on the board).
// Then the wire cut: the offline page, and its way back. PostHog and Sentry are refused so the proofs don't count as players.
// Exit 0 green, 1 red, 2 harness.
// mutant-anchors: none — a prototype's proof, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { createReport, dropProfile, freshProfile, launch } from './_harness.mjs';

const r = createReport('prove-live-door');
const bundleAt = process.argv.includes('--bundle') ? process.argv[process.argv.indexOf('--bundle') + 1] : null;
const telemetry = (u) => /posthog\.com|sentry\.io/.test(u.host);
const RUNS = Number(process.env.HR_RUNS || 3);

/** Process start to the sign-in form on screen, as the page itself clocks it, plus what it cost. */
async function door(profile, env = {}) {
  const a = await launch({ profile, block: telemetry, env });
  const bytes = { requests: 0, failed: 0, statusBad: [] };
  a.page.on('response', (res) => { bytes.requests++; if (res.status() >= 400) bytes.statusBad.push(res.status() + ' ' + res.url()); });
  await a.page.waitForSelector('form[data-auth="sign-in"]', { timeout: 120000 });
  const at = Date.now();
  const facts = await a.page.evaluate(() => ({
    url: location.href, version: document.documentElement.getAttribute('data-build') || null,
    fontsLoaded: document.fonts ? document.fonts.status : '',
    domComplete: Math.round(performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd),
    ua: navigator.userAgent, shell: window.hearthriseShell ? { kind: window.hearthriseShell.kind, version: window.hearthriseShell.version, steam: window.hearthriseShell.steam.running } : null,
    noNode: typeof require === 'undefined' && typeof process === 'undefined',
  }));
  const processStart = await a.main(() => process.getCreationTime());
  return { a, ms: at - processStart, facts, bytes };
}

const median = (xs) => [...xs].sort((p, q) => p - q)[Math.floor(xs.length / 2)];

try {
  const first = [], second = [];
  let last = null;
  for (let i = 0; i < RUNS; i++) {
    const profile = freshProfile('live');
    const one = await door(profile);
    first.push(one.ms);
    if (i === 0) {
      last = one;
      r.step('live: the sign-in form appears in the shell', true, one.facts.url);
      r.note('page facts', one.facts);
      r.step('live: the page has no Node and sees only the narrow shell object', one.facts.noNode === true && one.facts.shell && one.facts.shell.kind === 'desktop', one.facts.shell);
      r.step('live: no HTTP errors', one.bytes.statusBad.length === 0, one.bytes.statusBad.slice(0, 5));
      r.step('live: no console errors', one.a.errors.length === 0, one.a.errors.slice(0, 5).join(' | ').slice(0, 400));
      r.note('requests on a first visit', one.bytes.requests);
      r.note('failed (beyond the refused telemetry)', one.a.failed.filter((f) => !/posthog|sentry/.test(f)).slice(0, 5));
    }
    await one.a.close();
    const two = await door(profile);
    second.push(two.ms);
    await two.a.close();
    dropProfile(profile);
  }
  r.note('A, first launch, process start to sign-in form (ms)', { runs: first, median: median(first) });
  r.note('A, later launch, process start to sign-in form (ms)', { runs: second, median: median(second) });

  if (bundleAt) {
    const bundled = [];
    for (let i = 0; i < RUNS; i++) {
      const profile = freshProfile('bundle');
      const one = await door(profile, { HR_DESKTOP_BUNDLE: bundleAt });
      bundled.push(one.ms);
      if (i === 0) {
        r.step('B: the built folder answers the live origin', true, one.facts.url);
        r.step('B: no console errors', one.a.errors.length === 0, one.a.errors.slice(0, 5).join(' | ').slice(0, 400));
      }
      await one.a.close();
      dropProfile(profile);
    }
    r.note('B, first launch, process start to sign-in form (ms)', { runs: bundled, median: median(bundled) });
  }

  /* THE WIRE CUT. Chromium's own offline switch, so the rest of the machine keeps its network. */
  const profile = freshProfile('offline');
  const a = await launch({ profile, block: telemetry });
  await a.page.waitForSelector('form[data-auth="sign-in"]');
  await a.main(({ session }) => { session.defaultSession.enableNetworkEmulation({ offline: true }); globalThis.__hrShell.loadGame(); });
  await a.page.waitForFunction(() => /offline\.html$/.test(location.pathname) || !!document.querySelector('form[data-auth="sign-in"]'), null, { timeout: 30000 }).catch(() => {});
  await a.page.waitForTimeout(2500);
  const off = await a.page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(0, 200) }));
  r.note('with no network the window shows', off);
  r.step('no network: the app\'s own page says why', /offline\.html$/.test(off.path) && /reach the server/.test(off.text), off);
  await a.shot('live-offline');
  await a.main(({ session }) => { session.defaultSession.disableNetworkEmulation(); });
  await a.page.waitForURL(/hearthrise\.net\/play\.html/, { timeout: 30000 });
  await a.page.waitForSelector('form[data-auth="sign-in"]');
  r.step('network back: the window returns to the game on its own', true);
  await a.close();
  dropProfile(profile);
} catch (e) {
  r.step('the walk finished', false, String(e && e.stack || e).slice(0, 800));
}
process.exit(r.finish());
