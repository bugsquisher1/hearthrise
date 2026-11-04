#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/prove-live-door.mjs — THE SHELL AGAINST THE LIVE SITE, UP TO THE SIGN-IN FORM. NO ACCOUNT, NOTHING TYPED.
//
//   node tests/prove-live-door.mjs [--bundle DIR] [--offline-only]
//
// A real page load of https://hearthrise.net/play.html in the hidden shell: first launch (empty profile), second launch (the
// same profile, HTTP cache warm), and with --bundle the same origin answered from a built folder (option B on the board).
// Then the wire cut: the offline page, and its way back. PostHog and Sentry are refused so the proofs don't count as players.
// Exit 0 green, 1 red, 2 harness.
// mutant-anchors: none — a prototype's proof, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { createServer } from 'node:http';
import { createReport, dropProfile, freshProfile, launch } from './_harness.mjs';

const r = createReport('prove-live-door');
const bundleAt = process.argv.includes('--bundle') ? process.argv[process.argv.indexOf('--bundle') + 1] : null;
const telemetry = (u) => /posthog\.com|sentry\.io/.test(u.host);
const RUNS = process.argv.includes('--offline-only') ? 0 : Number(process.env.HR_RUNS || 3);

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
      /* the refused telemetry reads as net::ERR_FAILED; any other line is the page's */
      const own = one.a.errors.filter((e) => !/net::ERR_FAILED/.test(e));
      r.step('live: no console errors beyond the refused telemetry', own.length === 0, own.slice(0, 5).join(' | ').slice(0, 400));
      r.note('console lines from the refused telemetry', one.a.errors.length - own.length);
      r.note('requests on a first visit', one.bytes.requests);
      r.note('failed (beyond the refused telemetry)', one.a.failed.filter((f) => !/posthog|sentry/.test(f)).slice(0, 5));
    }
    await one.a.close();
    const two = await door(profile);
    second.push(two.ms);
    await two.a.close();
    dropProfile(profile);
  }
  if (RUNS) {
    r.note('A, first launch, process start to sign-in form (ms)', { runs: first, median: median(first) });
    r.note('A, later launch, process start to sign-in form (ms)', { runs: second, median: median(second) });
  }

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
  /* A warm cache first: the page itself comes from disk, so the sign-in form shows (nothing is typed on the live site; a press there
     answers with the game's own "Could not reach the server", AUTH_COPY.network). */
  await a.main(({ session }) => { session.defaultSession.enableNetworkEmulation({ offline: true }); globalThis.__hrShell.loadGame(); });
  await a.page.waitForFunction(() => !!document.querySelector('form[data-auth="sign-in"]'), null, { polling: 200 });
  r.step('no network, cached page: the game itself still opens, from disk', true);
  await a.main(({ session }) => { session.defaultSession.disableNetworkEmulation(); });
  await a.close();
  dropProfile(profile);

  /* NOTHING TO LOAD: a first launch with the site unreachable. A closed loopback port, so the rest of the machine keeps its network. */
  const holder = createServer();
  await new Promise((res) => holder.listen(0, '127.0.0.1', res));
  const port = holder.address().port;
  await new Promise((res) => holder.close(res));
  const profile2 = freshProfile('offline2');
  const b = await launch({ url: 'http://127.0.0.1:' + port + '/play.html', profile: profile2 });
  await b.page.waitForFunction(() => /offline\.html$/.test(location.pathname), null, { polling: 200, timeout: 120000 });
  const off = await b.page.evaluate(() => ({ path: location.pathname, text: document.body.innerText.slice(0, 200) }));
  r.note('with nothing to load the window shows', off);
  r.step('no network, nothing cached: the app\'s own page says why', /reach the server/.test(off.text), off);
  await b.shot('live-offline');
  const back = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(req.method === 'HEAD' ? undefined : '<!doctype html><title>back</title><p id="back">back</p>'); });
  await new Promise((res) => back.listen(port, '127.0.0.1', res));
  await b.page.waitForFunction(() => !!document.getElementById('back'), null, { polling: 200, timeout: 60000 });
  r.step('the host answers again: the window returns to the game on its own', true);
  back.closeAllConnections();
  await new Promise((res) => back.close(res));
  await b.close();
  dropProfile(profile2);
} catch (e) {
  r.step('the walk finished', false, String(e && e.stack || e).slice(0, 800));
}
process.exit(r.finish());
