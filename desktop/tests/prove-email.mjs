#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// desktop/tests/prove-email.mjs — THE EMAIL LINK, AGAINST THE LOCAL SHIM.
//
//   node tests/prove-email.mjs
//
// The shim sends no mail and confirms an account at once, so this plays the mail's part: a real token from the shim put in the
// fragment the auth server's redirect carries (#access_token=...&refresh_token=...&type=...), opened in a SECOND browser with its
// own storage, which is what the player's system browser is. Until "the link was opened", sign-in in the app answers what the live
// auth server answers: email_not_confirmed.
//
//   CONFIRM  app: create account -> "check your email" -> sign in says not confirmed -> the link opens in the browser ->
//            back in the app the same sign-in works, with no custom scheme, no change to uri_allow_list and no game change
//   RESET    app: forgot password -> link opens in the browser -> the game's own set-new-password screen there ->
//            back in the app the new password works and the old one doesn't
//   EXPIRED  the link's error comes back in the fragment: the browser explains it, the app is untouched
//   SCHEME   hearthrise://auth#... handed to a second launch (what Windows would do): the running app signs in from it. It works,
//            and the report says why it still isn't the flow (a link read on a phone never reaches this PC; a scheme needs an allow-list change)
//
// Exit 0 green, 1 red, 2 harness.
// mutant-anchors: none — a prototype's proof, not a repo guard
// ════════════════════════════════════════════════════════════════════════
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { DESKTOP, ELECTRON_BIN, PASSWORD, REPO, createHero, createReport, dropProfile, freshProfile, launch, signIn, signUpAndIn } from './_harness.mjs';

const { openWorld } = await import(pathToFileURL(join(REPO, 'tools/qa/local-world.mjs')).href);
const r = createReport('prove-email');
const world = await openWorld({ tickMs: false });
const profile = freshProfile('email');
let a = null, browser = null;
const NEW_PASSWORD = 'a-brand-new-password';

/** What a link in the mail lands on: a real session from the shim, in the fragment. */
async function linkFor(email, password, type) {
  const res = await fetch(world.origin + '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }), headers: { 'content-type': 'application/json' } });
  const s = await res.json();
  if (!s.access_token) throw new Error('the shim gave no session: ' + JSON.stringify(s));
  return world.url + '#access_token=' + s.access_token + '&expires_at=' + s.expires_at + '&expires_in=' + s.expires_in + '&refresh_token=' + s.refresh_token + '&token_type=bearer&type=' + type;
}

/** The system browser: another profile, its own storage. */
async function systemBrowser() {
  if (!browser) browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const local = new URL(world.origin).host;
  await ctx.route((u) => u.host !== local && u.protocol !== 'data:' && u.protocol !== 'blob:', (x) => x.abort());
  return ctx;
}

try {
  /* ── CONFIRM ── */
  a = await launch({ url: world.url, profile });
  let confirmed = false;
  await a.page.route('**/auth/v1/token?grant_type=password', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (!confirmed && body.email === 'confirm@local-world.test') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }) });
    return route.fallback();
  });
  await a.page.waitForSelector('form[data-auth="sign-in"]');
  const redirectTo = await a.page.evaluate(() => location.origin + location.pathname);
  r.note('redirectTo the app would send', redirectTo);
  await a.page.click('[data-auth-go="create"]');
  await a.page.fill('input[name=email]', 'confirm@local-world.test');
  await a.page.fill('input[name=password]', PASSWORD);
  await a.page.fill('input[name=confirm]', PASSWORD);
  await a.page.click('.auth-submit');
  await a.page.waitForFunction(() => /Check your email/.test(document.querySelector('.auth-message')?.textContent || ''));
  await a.page.click('[data-auth-go="sign-in"]');
  await signIn(a.page, 'confirm@local-world.test');
  await a.page.waitForFunction(() => /isn't confirmed yet/.test(document.querySelector('.auth-message')?.textContent || ''));
  r.step('app: sign-in before the link says not confirmed, with Send me a new link', !!(await a.page.$('[data-auth-resend]')));

  const browserA = await systemBrowser();
  const page1 = await browserA.newPage();
  await page1.goto(await linkFor('confirm@local-world.test', PASSWORD, 'signup'), { waitUntil: 'load' });
  await page1.waitForSelector('.char-row, [data-app="create"], form[data-auth]');
  const landed = await page1.evaluate(() => ({ hash: location.hash, signedIn: !document.querySelector('form[data-auth]'), text: document.body.innerText.slice(0, 200) }));
  r.step('system browser: the link signs that browser in, on the game\'s own page', landed.signedIn, landed.text);
  r.step('system browser: the token is gone from the address bar', !/access_token/.test(landed.hash), landed.hash.slice(0, 40));
  confirmed = true;
  await browserA.close();

  await signIn(a.page, 'confirm@local-world.test');
  await a.page.waitForSelector('.char-row, [data-app="create"]');
  r.step('app: the same press now signs in (typed password, no scheme, no allow-list change)', true);

  /* ── RESET ── */
  await a.close();
  a = await launch({ url: world.url, profile: freshProfile('email2') });
  await signUpAndIn(a.page, 'reset@local-world.test');
  await a.page.waitForSelector('.char-row, [data-app="create"]');
  await a.close();
  const resetProfile = freshProfile('email3');
  a = await launch({ url: world.url, profile: resetProfile });
  await a.page.waitForSelector('form[data-auth="sign-in"]');
  await a.page.click('[data-auth-go="forgot"]');
  await a.page.fill('input[name=email]', 'reset@local-world.test');
  await a.page.click('.auth-submit');
  await a.page.waitForFunction(() => /a link to reset/.test(document.querySelector('.auth-message')?.textContent || ''));
  r.step('app: Forgot your password says a link is coming', true);

  const browserB = await systemBrowser();
  const page2 = await browserB.newPage();
  await page2.goto(await linkFor('reset@local-world.test', PASSWORD, 'recovery'), { waitUntil: 'load' });
  await page2.waitForSelector('form[data-auth="set-password"]');
  r.step('system browser: the link opens the game\'s own Choose a new password screen', true);
  await page2.fill('input[name=password]', NEW_PASSWORD);
  await page2.fill('input[name=confirm]', NEW_PASSWORD);
  await page2.click('.auth-submit');
  await page2.waitForSelector('.char-row, [data-app="create"]');
  r.step('system browser: saved, and that browser is now signed in too', true);
  await browserB.close();

  await a.page.click('[data-auth-go="sign-in"]');
  await signIn(a.page, 'reset@local-world.test', PASSWORD);
  await a.page.waitForFunction(() => /do not match/.test(document.querySelector('.auth-message')?.textContent || ''));
  r.step('app: the old password is refused', true);
  await signIn(a.page, 'reset@local-world.test', NEW_PASSWORD);
  await a.page.waitForSelector('.char-row, [data-app="create"]');
  r.step('app: the new password signs in', true);
  await a.close();
  a = null;

  /* ── EXPIRED ── */
  const browserC = await systemBrowser();
  const page3 = await browserC.newPage();
  await page3.goto(world.url + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', { waitUntil: 'load' });
  await page3.waitForFunction(() => /expired or was already used/.test(document.querySelector('.auth-message')?.textContent || ''));
  r.step('system browser: an expired link says so, and offers the way on', true);
  await browserC.close();

  /* ── SCHEME (the experiment) ── */
  const schemeProfile = freshProfile('email4');
  a = await launch({ url: world.url, profile: schemeProfile });
  await a.page.waitForSelector('form[data-auth="sign-in"]');
  const link = await linkFor('reset@local-world.test', NEW_PASSWORD, 'signup');
  const hash = link.slice(link.indexOf('#'));
  /* a second launch with the link on its command line, as Windows would start it. The registry is not touched. */
  const env = { ...process.env, HR_DESKTOP_HIDDEN: '1', HR_DESKTOP_USER_DATA: schemeProfile, HR_DESKTOP_URL: world.url };
  delete env.ELECTRON_RUN_AS_NODE;
  const second = spawn(ELECTRON_BIN, [DESKTOP, 'hearthrise://auth' + hash], { env, stdio: 'ignore' });
  const gone = await new Promise((res) => { const t = setTimeout(() => res(null), 60000); second.on('exit', (c) => { clearTimeout(t); res(c); }); });
  r.step('hearthrise:// second launch exits at once and hands the link over', gone !== null, gone);
  await a.page.waitForFunction(() => /link=1/.test(location.href) || !document.querySelector('form[data-auth]'), null, { timeout: 30000 });
  await a.page.waitForSelector('.char-row, [data-app="create"]');
  r.step('hearthrise:// the running app signs itself in from the link', true);
  await a.page.waitForFunction(() => !/access_token/.test(location.href), null, { timeout: 15000 });
  r.step('hearthrise:// the token leaves the address', true);
  await a.close();
  a = null;
  dropProfile(schemeProfile);
  dropProfile(resetProfile);
} catch (e) {
  r.step('the walk finished', false, String(e && e.stack || e).slice(0, 800));
  if (a) await a.shot('zz-email-failed').catch(() => {});
} finally {
  if (a) await a.close();
  if (browser) await browser.close().catch(() => {});
  await world.close();
  dropProfile(profile);
}
process.exit(r.finish());
