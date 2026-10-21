#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/report-problem.mjs — A PLAYER'S PROBLEM REPORT REACHES THE TEAM, WITH ITS DETAILS.
//
//   node tests/report-problem.mjs           the checks
//   node tests/report-problem.mjs --mutate  every planted defect must turn a check RED
//
// mutant-anchors: src/session/account-session.js src/shell/report-model.js src/shell/windows/report.js src/data/settings.js src/data/shell-windows.js src/styles/windows.css
//
// play.html in a real Chromium with supabase-js and the REST paths stubbed
// (tests/_client-harness.mjs), the character in the fixture hunt. The Edge
// Function bug-report-bridge is routed and recorded.
//   RP-1  the launcher row opens Report a problem; Send stays off until there is text
//   RP-2  Send posts ONE body to bug-report-bridge with the player's token: the first
//         line as summary, the whole text, the version, the character (slot, name),
//         its envelope version, its hunt (id, ground, session, live engine), the
//         viewport, this load's console errors, a key, and (desktop) a JPEG of the World
//   RP-3  the bridge's yes shows "Sent." and clears the box; its rate limit shows when
//         to try again and keeps the text
//   RP-4  Settings > Help > Report a problem opens the same window
//   RP-5  nothing on the page threw
//   RP-6  on the phone sheet (922x423) a refusal line is wholly on screen (v0.2.24 gate:
//         it ran below the edge)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';

const BUILD_SRC = await readFile(join(ROOT, 'src/build-info.js'), 'utf8');
const VERSION = /version:\s*'([^']+)'/.exec(BUILD_SRC)[1];
const HUNT = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
/* The same hero in town (the v0.2.24 gate met the phone sheet there): no hunt section, idle. */
const TOWN = Object.fromEntries(Object.entries(HUNT).filter(([k]) => !/^hunt/.test(k) && k !== 'party'));
TOWN.state = Object.assign({}, HUNT.state, { active_kind: 'idle' });
const WIN = '[data-hs-win="report"]';

const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

const OK = { status: 200, body: { ok: true, status: 'accepted', report_id: 7, relayed: true } };
const LIMITED = { status: 429, body: { ok: false, status: 'rate_limited', retry_after_s: 300 } };

/* play.html at `viewport`, signed in and in the fixture hunt; the bridge answers `io.answer` and records into `io.sent`. */
async function openGame(browser, port, viewport, io, fails, env = HUNT) {
  const ctx = await browser.newContext({ viewport });
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => io.errors.push(e.message));
  await pg.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pg.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  let v = 0;
  await pg.route('https://nezapsylztqbbwuwembx.supabase.co/**', (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    if (name === 'bug-report-bridge') {
      io.sent.push({ auth: r.request().headers().authorization || '', body: JSON.parse(r.request().postData() || '{}') });
      return r.fulfill({ status: io.answer.status, contentType: 'application/json', body: JSON.stringify(io.answer.body) });
    }
    if (name === 'hr_load' || name === 'hr-accrue') {
      v++;
      const b = Object.assign({}, env, { version: v });
      return r.fulfill({ contentType: 'application/json', body: JSON.stringify(name === 'hr-accrue' ? Object.assign({ accrued: true }, b) : b) });
    }
    return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });
  await pg.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load' });
  await wait(pg, () => document.querySelector('form[data-auth="sign-in"]'));
  await pg.fill('input[name=email]', 'qa@example.test');
  await pg.fill('input[name=password]', 'not-a-real-password');
  await pg.click('.auth-submit');
  if (!(await wait(pg, () => document.querySelector('[data-app="play"][data-slot="0"]')))) { fails.push('RP-1 sign-in did not reach the characters screen'); return null; }
  await pg.click('[data-app="play"][data-slot="0"]');
  if (!(await wait(pg, () => document.querySelector('[data-hs-open="report"]')))) { fails.push('RP-1 the launcher row has no Report a problem'); return null; }
  return { ctx, pg };
}

/* RP-6: on the phone sheet (922x423) a refusal's line is on screen, wholly. */
async function phoneChecks(browser, port, fails) {
  const io = { answer: LIMITED, sent: [], errors: [] };
  const g = await openGame(browser, port, { width: 922, height: 423 }, io, fails, TOWN);
  if (!g) return;
  const { ctx, pg } = g;
  await pg.click('[data-hs-open="report"]');
  if (!(await wait(pg, (w) => document.querySelector(w + ' .rp-text'), WIN))) { fails.push('RP-6 the launcher did not open the report sheet'); await ctx.close(); return; }
  await pg.fill(WIN + ' .rp-text', 'A second report.');
  await pg.click(WIN + ' [data-hs-act="send"]');
  if (!(await wait(pg, (w) => /Try again in/.test(document.querySelector(w + ' .rp-said').textContent), WIN))) fails.push('RP-6 the phone sheet shows no refusal line');
  else {
    /* Where the line is, against the sheet body's visible box and the screen. */
    const place = () => pg.evaluate((w) => {
      const q = document.querySelector(w + ' .rp-said').getBoundingClientRect();
      const b = document.querySelector(w + ' [data-hs-body]').getBoundingClientRect();
      return { top: Math.round(q.top), bottom: Math.round(q.bottom), screen: innerHeight, bodyTop: Math.round(b.top), bodyBottom: Math.round(b.bottom),
        box: Math.round(document.querySelector(w + ' .rp-text').getBoundingClientRect().height) };
    }, WIN);
    const shown = (r) => r.top >= Math.max(0, r.bodyTop) && r.bottom <= Math.min(r.screen, r.bodyBottom);
    const r = await place();
    if (!shown(r)) fails.push('RP-6 at 922x423 the refusal line runs off the screen: ' + JSON.stringify(r));
    if (r.box > 96) fails.push('RP-6 the text box is ' + r.box + ' px tall on the phone sheet, want at most 96');
    /* The box made tall (a player drags its corner; a wider font) and the sheet scrolled to its top: the line still shows. */
    await pg.evaluate((w) => { document.querySelector(w + ' .rp-text').style.height = '400px'; document.querySelector(w + ' [data-hs-body]').scrollTop = 0; }, WIN);
    const tall = await place();
    if (!shown(tall)) fails.push('RP-6 with a tall text box the refusal line is scrolled off the sheet: ' + JSON.stringify(tall));
  }
  if (io.errors.length) fails.push('RP-6 page errors: ' + io.errors.slice(0, 2).join(' | '));
  await ctx.close();
}

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    const io = { answer: OK, sent: [], errors: [] };
    const sent = io.sent;
    const errors = io.errors;
    const g = await openGame(browser, port, { width: 1280, height: 720 }, io, fails);
    if (!g) return fails;
    const { ctx, pg } = g;
    // RP-1
    await pg.click('[data-hs-open="report"]');
    if (!(await wait(pg, (w) => document.querySelector(w + ' .rp-text'), WIN))) { fails.push('RP-1 the launcher did not open the report window'); return fails; }
    if (!(await pg.evaluate((w) => document.querySelector(w + ' [data-hs-act="send"]').disabled, WIN))) fails.push('RP-1 Send is on with an empty box');

    // RP-2
    await pg.evaluate(() => console.error('report-probe error'));
    await pg.fill(WIN + ' .rp-text', 'Leaving the hunt froze the screen\nIt came back after a few seconds.');
    if (!(await wait(pg, (w) => !document.querySelector(w + ' [data-hs-act="send"]').disabled, WIN))) fails.push('RP-1 Send stays off with text in the box');
    await pg.click(WIN + ' [data-hs-act="send"]');
    if (!(await wait(pg, (w) => /^Sent\./.test(document.querySelector(w + ' .rp-said').textContent), WIN))) fails.push('RP-3 the bridge said yes and the window does not say Sent: "' + await pg.evaluate((w) => document.querySelector(w + ' .rp-said').textContent, WIN) + '"');
    if (sent.length !== 1) fails.push('RP-2 ' + sent.length + ' report(s) reached the bridge, want 1');
    else {
      const { auth, body: b } = sent[0];
      const st = b.state || {};
      const h = st.hunt || {};
      if (!/^Bearer jwt-/.test(auth)) fails.push('RP-2 the report went without the player\'s token: ' + auth);
      if (b.summary !== 'Leaving the hunt froze the screen' || b.description !== 'Leaving the hunt froze the screen\nIt came back after a few seconds.') fails.push('RP-2 summary/description: ' + JSON.stringify([b.summary, b.description]));
      if (b.build !== VERSION) fails.push('RP-2 build ' + b.build + ', want ' + VERSION);
      if (!st.character || st.character.slot !== 0 || st.character.name !== HUNT.name) fails.push('RP-2 the character: ' + JSON.stringify(st.character));
      if (!st.envelope || !Number.isInteger(st.envelope.version)) fails.push('RP-2 the envelope: ' + JSON.stringify(st.envelope));
      if (h.id !== HUNT.hunt.hunt_id || h.session !== HUNT.hunt.session_id || !h.ground || !h.live || !('swing' in h.live)) fails.push('RP-2 the hunt: ' + JSON.stringify(h).slice(0, 300));
      if (st.viewport !== '1280x720' || st.device !== 'desktop' || !st.perf) fails.push('RP-2 the screen/perf: ' + JSON.stringify([st.viewport, st.device, st.perf]));
      if (!Array.isArray(b.errors) || !b.errors.some((e) => e.level === 'error' && /report-probe error/.test(e.msg))) fails.push('RP-2 the console errors are not attached: ' + JSON.stringify(b.errors).slice(0, 200));
      if (!b.idem_key) fails.push('RP-2 no idempotency key');
      if (!/^data:image\/jpeg;base64,/.test(b.screenshot || '')) fails.push('RP-2 no picture of the World on desktop: ' + String(b.screenshot).slice(0, 40));
      if (JSON.stringify(st).length > 8000) fails.push('RP-2 the state is over the bridge\'s 8000 characters (' + JSON.stringify(st).length + ')');
      for (const k of ['user_id', 'email', 'uid', 'reporter']) if (k in b) fails.push('RP-2 the body names the reporter (' + k + '): the bridge reads the token');
    }
    if (await pg.evaluate((w) => document.querySelector(w + ' .rp-text').value, WIN)) fails.push('RP-3 the box kept the sent text');

    // RP-3: the bridge's rate limit
    io.answer = LIMITED;
    await pg.fill(WIN + ' .rp-text', 'A second report');
    await pg.click(WIN + ' [data-hs-act="send"]');
    if (!(await wait(pg, (w) => /Try again in 5 minutes/.test(document.querySelector(w + ' .rp-said').textContent), WIN))) fails.push('RP-3 the rate limit shows: "' + await pg.evaluate((w) => document.querySelector(w + ' .rp-said').textContent, WIN) + '"');
    if (await pg.evaluate((w) => document.querySelector(w + ' .rp-text').value, WIN) !== 'A second report') fails.push('RP-3 a refused report lost its text');

    // RP-4: Settings > Help
    await pg.click(WIN + ' [data-hs-close="report"]');
    await wait(pg, (w) => !document.querySelector(w), WIN);
    await pg.click('[data-hs-open="settings"]');
    if (!(await wait(pg, () => document.querySelector('.st-tab[data-cat="help"]:not([hidden])')))) fails.push('RP-4 Settings has no Help');
    else {
      await pg.click('.st-tab[data-cat="help"]');
      await pg.click('[data-sid="help.report"][data-hs-act="run"]');
      if (!(await wait(pg, (w) => document.querySelector(w + ' .rp-text'), WIN))) fails.push('RP-4 Settings > Help > Report a problem did not open the window');
    }

    // RP-5
    if (errors.length) fails.push('RP-5 page errors: ' + errors.slice(0, 2).join(' | '));
    await ctx.close();

    await phoneChecks(browser, port, fails);
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  ['the report never leaves', 'src/session/account-session.js', 'const ans = await this.server.report(body);', "const ans = { ok: false, status: 0, error: 'network', body: null };"],
  ['the hunt is not attached', 'src/shell/report-model.js', 'hunt: huntState(cs),', 'hunt: null,'],
  ['the console errors are not attached', 'src/shell/report-model.js', 'const errors = (o.diag ? o.diag.recent() : [])', 'const errors = ([])'],
  ['a refusal reads as sent', 'src/shell/windows/report.js', 'const sent = r.ok || SENT.has(r.status);', 'const sent = true;'],
  ['Settings has no way in', 'src/data/settings.js', "type: 'action', open: 'report',", "type: 'action', open: 'friends',"],
  ['the launcher row has no way in', 'src/data/shell-windows.js', "glyph: 'uiWarn', width: 420, object: 'plain' }", "glyph: 'uiWarn', width: 420, object: 'plain', launcher: false }"],
  ['the answer line scrolls away on the phone', 'src/styles/windows.css', '.rp-foot { position: sticky; bottom: 0;', '.rp-foot {'],
  ['the phone box keeps its desktop height', 'src/styles/windows.css', '  .rp-text { height: 96px; min-height: 96px; }', ''],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'report-problem: ' + fails.length + ' check(s) RED' : 'report-problem: the launcher and Settings open it; one body with the character, its hunt, the errors and a picture reaches the bridge; Sent and the rate limit read plainly');
    process.exit(fails.length ? 1 : 0);
  }
  let bad = 0;
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  for (const [name, file, from, to] of MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, to) });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'report-problem --mutate: ' + bad + ' escaped' : 'report-problem --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
