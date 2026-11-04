#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/account-delete-world.mjs — DELETING AN ACCOUNT, PLAYED: THE REAL GAME, NO PRODUCTION.
//
//   node tests/account-delete-world.mjs [--shots DIR] [--tail]     exit 0 green, 1 red, 2 harness
//     --tail: the chain from the cache up to the file before 2027-02-25-account-delete.sql, then that file (while editing it)
//
// tools/qa/local-world.mjs: the real play.html and the real engine on the replayed chain, a brand-new account from the sign-in
// screen. A manual walk (tests/guards-unregistered.json); the rules are mutation-proven in CI by tests/account-delete.mjs.
//
//   AW-1   a hero hunts; Settings, Account, Delete account opens at 1366x768 as a centered window with the words, the fields and an off press
//   AW-2   a wrong password says so and deletes nothing; the press stays off until both fields are filled
//   AW-3   the right ones: every screen gives way to the way back with the server's date; the hunt is over on the server
//   AW-4   sign out, sign in: the same way back, nothing else reachable
//   AW-5   Keep my account: the characters screen, the hero whole and in town, the bag still there
//   AW-6   delete again from the characters screen at 667x375 (a phone: the form on its card, reachable and on screen)
//   AW-7   30 days pass (world.wait) and the job's own command runs: the auth user and every hero are gone
//   AW-8   sign-in refused with the plain line
//   AW-9   the same email signs up as a brand-new account: a new id, no hero, no gold of the old one
//   AW-10  no console errors; nothing left the machine
// Screenshots (--shots): the form at both sizes, the way back, the refusal.
// mutant-anchors: none — a manual walk of the real game; the server rules are mutation-proven in tests/account-delete.mjs
// ════════════════════════════════════════════════════════════════════════
import { resolve as resolvePath, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 500)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};
const PASSWORD = 'local-world-password';
const TAIL = '2027-02-25-account-delete.sql';

async function main() {
  const world = await openWorld({ tickMs: false, ...(args.includes('--tail') ? { tail: TAIL } : {}) });
  console.log('world up in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  let n = 0;
  const shot = async (page, name) => {
    if (!shots) return;
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, String(++n).padStart(2, '0') + '-' + name + '.png') });
  };
  try {
    const p = await world.play({ account: 'leaver', viewport: { width: 1366, height: 768 } });
    const { page } = p;
    const sql = async (q, params) => (await world.db.query(q, params)).rows[0];
    await p.createHero('Marlow');
    await p.enterHunt('mill_cellar');
    const me = (await sql(`select user_id from public.player_state limit 1`)).user_id;
    await world.skip(2);

    /* AW-1 */
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-hs-win="settings"]');
    await page.click('.st-tab[data-cat="account"]');
    await page.click('[data-row="account.delete"] [data-hs-act="run"]');
    await page.waitForSelector('[data-hs-win="account-delete"] .ad');
    await shot(page, 'form-1366');
    const w = await page.evaluate(() => {
      const el = document.querySelector('[data-hs-win="account-delete"]');
      const r = el.getBoundingClientRect();
      const go = el.querySelector('[data-ad="delete"]');
      const pr = go.getBoundingClientRect();
      return { text: el.innerText, modal: el.classList.contains('is-modal'), left: r.left, right: r.right, top: r.top, bottom: r.bottom, vw: innerWidth, vh: innerHeight, off: go.disabled, press: pr.bottom <= innerHeight && pr.top >= 0 };
    });
    step('AW-1 the window: centered, says what goes and when, the press off and on screen', w.modal && w.off && w.press && /every hero/.test(w.text) && /30 days/.test(w.text) && /Keep my account/.test(w.text) && /Type DELETE/.test(w.text)
      && Math.abs((w.left + w.right) / 2 - w.vw / 2) < 4 && w.bottom <= w.vh, JSON.stringify(w));

    /* AW-2 */
    const word = '[data-hs-win="account-delete"] [name="ad-word"]', pass = '[data-hs-win="account-delete"] [name="ad-password"]', go = '[data-hs-win="account-delete"] [data-ad="delete"]';
    await page.fill(word, 'delete');
    const offWithoutPassword = await page.$eval(go, (b) => b.disabled);
    await page.fill(pass, 'not-the-password');
    await page.click(go);
    await page.waitForFunction(() => /nothing was deleted/.test(document.querySelector('[data-hs-win="account-delete"] .auth-message')?.textContent || ''));
    const wrong = await page.$eval('[data-hs-win="account-delete"] .auth-message', (m) => m.textContent);
    const waiting0 = (await sql(`select count(*)::int as n from public.hr_account_deletions`)).n;
    const stillHunting = (await sql(`select count(*)::int as n from public.hunt_sessions where ended_at is null`)).n;
    await shot(page, 'wrong-password');
    step('AW-2 a wrong password says so, and nothing is deleted; the press is off without one', offWithoutPassword && /password/.test(wrong) && waiting0 === 0 && stillHunting === 1, JSON.stringify({ offWithoutPassword, wrong, waiting0, stillHunting }));

    /* AW-3 */
    await page.fill(pass, PASSWORD);
    await page.click(go);
    await page.waitForSelector('[data-account-leaving]');
    await shot(page, 'way-back');
    const back = await page.evaluate(() => document.querySelector('[data-account-leaving]').innerText);
    const row = await sql(`select purge_at, requested_at from public.hr_account_deletions where user_id = $1`, [me]);
    const dateText = new Date(row.purge_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const ended = await sql(`select end_reason, forfeit from public.hunt_sessions where user_id = $1 order by entered_at desc limit 1`, [me]);
    const open = (await sql(`select count(*)::int as n from public.hunt_sessions where ended_at is null`)).n;
    const hero = await sql(`select active_kind from public.player_state where user_id = $1`, [me]);
    const days = Math.round((new Date(row.purge_at) - new Date(row.requested_at)) / 86400000);
    step('AW-3 the way back, with the server\'s date; the hunt is over and the hero idle on the server', back.includes(dateText) && /Keep my account/.test(back) && days === 30 && open === 0 && ended.end_reason === 'left' && !ended.forfeit && hero.active_kind === 'idle',
      JSON.stringify({ back, dateText, days, open, ended, hero }));

    /* AW-4 */
    await page.click('[data-app="sign-out"]');
    await page.waitForSelector('form[data-auth="sign-in"]');
    await page.fill('input[name=email]', p.email);
    await page.fill('input[name=password]', PASSWORD);
    await page.click('.auth-submit');
    await page.waitForSelector('[data-account-leaving]');
    const gameThere = await page.$('.hs-launchers');
    const charsThere = await page.$('.char-row');
    step('AW-4 sign out, sign in: the same way back, and no game behind it', !gameThere && !charsThere, JSON.stringify({ gameThere: !!gameThere, charsThere: !!charsThere }));

    /* AW-5 */
    await page.click('[data-leaving="keep"]');
    await page.waitForSelector('.char-row, .hs-launchers');
    const waiting1 = (await sql(`select count(*)::int as n from public.hr_account_deletions`)).n;
    if (await page.$('[data-app="play"]')) await page.click('[data-app="play"]');
    await page.waitForSelector('.hs-launchers');
    const hidden = (await sql(`select count(*)::int as n from public.hr_lb_hidden where user_id = $1`, [me])).n;
    await page.click('[data-hs-open="inventory"]');
    await page.waitForSelector('.hw-pocket[data-item]');
    const pockets = await page.evaluate(() => document.querySelectorAll('.hw-pocket[data-item]').length);
    const itemsOnServer = (await sql(`select count(*)::int as n from public.player_inventory where user_id = $1`, [me])).n;
    step('AW-5 Keep my account: back in the game, the bag whole, off the deletion list, back on the boards', waiting1 === 0 && hidden === 0 && pockets > 0 && itemsOnServer > 0, JSON.stringify({ waiting1, hidden, pockets, itemsOnServer }));

    /* AW-6: the phone, from the characters screen */
    await page.setViewportSize({ width: 667, height: 375 });
    await page.evaluate(() => { const b = document.querySelector('[data-app="characters"]'); if (b) b.click(); });
    await p.reload();
    const atGame = await page.$('.hs-launchers');
    if (atGame) {
      await page.evaluate(() => { window.HearthriseStorage && window.HearthriseStorage.session && window.HearthriseStorage.session.keys().forEach((k) => window.HearthriseStorage.session.remove(k)); });
      await page.reload({ waitUntil: 'load' });
    }
    await page.waitForSelector('[data-app="delete-account"], .hs-launchers');
    if (!(await page.$('[data-app="delete-account"]'))) throw new Error('no characters screen to reach Delete account from');
    await page.click('[data-app="delete-account"]');
    await page.waitForSelector('.auth-card.is-delete');
    await shot(page, 'form-667');
    const phone = await page.evaluate(() => {
      const el = document.querySelector('.auth-card.is-delete');
      const go = el.querySelector('[data-ad="delete"]');
      go.scrollIntoView({ block: 'nearest' });
      const r = go.getBoundingClientRect();
      const small = Array.from(el.querySelectorAll('p, label, button, input')).filter((n) => parseFloat(getComputedStyle(n).fontSize) < 12).length;
      return { sideways: document.documentElement.scrollWidth > innerWidth, w: r.width, h: r.height, onScreen: r.bottom <= innerHeight + 1 && r.top >= -1, small };
    });
    await shot(page, 'form-667-foot');
    await page.fill('.auth-card.is-delete [name="ad-word"]', 'DELETE');
    await page.fill('.auth-card.is-delete [name="ad-password"]', PASSWORD);
    await page.click('.auth-card.is-delete [data-ad="delete"]');
    await page.waitForSelector('[data-account-leaving]');
    await shot(page, 'way-back-667');
    const waiting2 = (await sql(`select count(*)::int as n from public.hr_account_deletions`)).n;
    step('AW-6 from the characters screen at 667x375: no sideways scroll, a press a thumb can reach, text at reading size', !phone.sideways && phone.onScreen && phone.h >= 36 && phone.small === 0 && waiting2 === 1, JSON.stringify({ phone, waiting2 }));

    /* AW-7 */
    await page.click('[data-app="sign-out"]');
    await page.waitForSelector('form[data-auth="sign-in"]');
    await world.wait(30 * 24 * 60 + 1);
    const ran = await world.cron('hr-account-purge');
    const authRow = (await sql(`select count(*)::int as n from auth.users where id = $1`, [me])).n;
    const heroes = (await sql(`select count(*)::int as n from public.player_state where user_id = $1`, [me])).n;
    await world.tick().catch(() => {});
    step('AW-7 30 days pass and the job runs: the account and every hero are gone', ran && ran.purged === 1 && authRow === 0 && heroes === 0, JSON.stringify({ ran, authRow, heroes }));

    /* AW-8 */
    await page.fill('input[name=email]', p.email);
    await page.fill('input[name=password]', PASSWORD);
    await page.click('.auth-submit');
    await page.waitForFunction(() => (document.querySelector('.auth-message')?.textContent || '').length > 0);
    const refused = await page.$eval('.auth-message', (m) => m.textContent);
    await shot(page, 'refused');
    step('AW-8 sign-in refused with the plain line', /do not match an account/.test(refused), refused);

    /* AW-9 */
    await page.click('[data-auth-go="create"]');
    await page.fill('input[name=email]', p.email);
    await page.fill('input[name=password]', PASSWORD);
    await page.fill('input[name=confirm]', PASSWORD);
    await page.click('.auth-submit');
    await page.waitForFunction(() => /Check your email/.test(document.querySelector('.auth-message')?.textContent || ''));
    await page.click('[data-auth-go="sign-in"]');
    await page.fill('input[name=email]', p.email);
    await page.fill('input[name=password]', PASSWORD);
    await page.click('.auth-submit');
    await page.waitForSelector('.char-row');
    const list = await page.evaluate(() => Array.from(document.querySelectorAll('.char-row')).map((r) => r.innerText).join(' | '));
    const fresh = (await sql(`select id from auth.users order by id limit 1`));
    const leftovers = (await sql(`select count(*)::int as n from public.player_state where user_id = $1`, [me])).n;
    step('AW-9 the same email signs up new: a different id, no hero, nothing of the old account', fresh && fresh.id !== me && leftovers === 0 && !/Marlow/.test(list) && /Create hero/.test(list), JSON.stringify({ list, fresh, me, leftovers }));

    /* AW-10 */
    const benign = (e) => /401|403|Failed to load resource/.test(e);
    const errors = p.errors.filter((e) => !benign(e));
    step('AW-10 no console errors but the refusals themselves; nothing left the machine', errors.length === 0 && p.offsite.length === 0 && world.offsite.length === 0, [...errors.slice(0, 5), ...p.offsite.slice(0, 3), ...world.offsite.slice(0, 3)].join(' | '));
  } finally {
    await world.close();
  }
}

try {
  await main();
} catch (e) {
  console.error('account-delete-world: ' + (e && e.stack || e));
  process.exit(fails.length ? 1 : 2);
}
console.log(fails.length ? 'account-delete-world: RED (' + fails.length + ')' : 'account-delete-world: green');
process.exit(fails.length ? 1 : 0);
