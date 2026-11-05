#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/char-wipe-world.mjs — THE DECLARED WIPE, PLAYED: A BROWSER THAT PLAYED BEFORE IT RELOADS AFTER IT, AND A NEW HERO IN SLOT 0 GETS THE FIRST-TIME FLOW.
//
//   node tests/char-wipe-world.mjs [--shots DIR] [--tail]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and the real engine on the replayed chain, closed as production is, the whole procedure in
// order through the real files, with the real tick. A manual walk (tests/guards-unregistered.json); the rules are mutation-proven in CI
// by tests/char-wipe.mjs.
//
//   WW-1   a veteran plays: a hero, a hunt, a summary, cards read, an open hunt, a market listing, a party; its residue is on the server
//   WW-2   the procedure in order, with that page still open and a hunt running: every file applies
//   WW-3   the real tick and every scheduled job on the empty world: no error, nothing resurrected
//   WW-4   a tab left open through it: it stops with the way back to the characters screen, not a dead game
//   WW-5   the reload: the characters screen, both slots empty, the bought one gone, no error
//   WW-6   a new hero in slot 0, the old name free: the same first card as a brand-new account's, no summary, no death popup, no away line
//   WW-7   nothing old on the server: the new hero's residue holds none of the old cards, summaries or stamps, and a stale tab closing adds none
//   WW-8   the real engine plays it: a first hunt fights, settles and comes home to a summary of the new hero's first kills
//   WW-9   the closed door holds: an account on no list lands on the closed notice with its id; the allowlist is unmoved
//   WW-10  the boards are empty, no page says anything about what happened, no console errors, nothing left the machine
// mutant-anchors: none — a manual walk of the real game; the server rules are mutation-proven in tests/char-wipe.mjs
// ════════════════════════════════════════════════════════════════════════
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join, resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openWorld } from '../tools/qa/local-world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 700)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};
const file = async (f) => (await readFile(join(ROOT, 'supabase/migrations', f), 'utf8')).replace(/\r\n/g, '\n');
const SAYS_WHAT_HAPPENED = /\bwipe|rebuild|overhaul|start(ed)? over|fresh start/i;

async function main() {
  const world = await openWorld({ tickMs: false });
  console.log('world up in ' + Math.round((Date.now() - t0) / 1000) + ' s');
  const { db } = world;
  const sql = async (q, params) => (await db.query(q, params)).rows[0];
  const apply = (f) => file(f).then((text) => db.exec('begin;\n' + text + '\ncommit;'));
  let n = 0;
  const shot = async (page, name) => {
    if (!shots) return;
    mkdirSync(shots, { recursive: true });
    await page.screenshot({ path: join(shots, String(++n).padStart(2, '0') + '-' + name + '.png') });
  };
  const first = (page) => page.evaluate(() => {
    const c = document.querySelector('.hs-pointer[data-coach]');
    return c ? { id: c.getAttribute('data-coach'), text: c.innerText.replace(/\s+/g, ' ').trim() } : null;
  });
  try {
    /* WW-1: the game opened for the walk, then closed below, as the procedure wants it */
    await apply('2027-02-14-market-on.sql');
    await db.query(`update public.hr_market_config set min_level = 1 where only_row`);
    const p = await world.play({ account: 'veteran', viewport: { width: 1366, height: 768 } });
    const { page } = p;
    await p.createHero('Marlow');
    await p.enterHunt('mill_cellar');
    const me = (await sql(`select user_id from public.player_state limit 1`)).user_id;
    await world.skip(6);
    await page.click('[data-hs-act="leave"]');
    await page.waitForFunction(() => /Mill Cellar/.test(document.querySelector('.hsum-card .hsum-title')?.textContent || ''), null, { timeout: 60000 });
    /* Read every card the coach puts up for a while, as a player pressing Got it does. */
    for (let i = 0; i < 4; i++) { const b = await page.$('.hs-pointer .hs-coach-close'); if (b) await b.click().catch(() => {}); await page.waitForTimeout(300); }
    await db.query(`update public.player_state set client_state = client_state || $1::jsonb where user_id = $2 and slot = 0`, [JSON.stringify({ coach: { read: ['old_card_one', 'old_card_two'] }, awaySeen: { at: Date.now(), s: 'old' }, hudLayout: { desktop: { chat: { dx: 40 } } } }), me]);
    await p.reload();
    if (await page.$('[data-app="play"]')) await page.click('[data-app="play"]');
    await page.waitForSelector('.hs-launchers');
    await page.click('[data-hs-open="hunts"]');
    await page.click('.hw-hunt[data-hunt="mill_cellar"]');
    await page.click('.hw-hunt-enter');
    await page.waitForSelector('[data-hs-act="leave"]');
    await world.skip(2);
    /* A market listing and a party, through the verbs, and a second hero's slot it bought. */
    await db.query(`update public.account_wallet set gold = 90000000 where user_id = $1`, [me]);
    const item = (await sql(`select m.item_id, m.floor_each::text f from public.hr_market_items m where m.listable and m.floor_each > 1 and m.ceiling_each < 1000000000 and m.item_id not in (select item_id from public.hr_item_slots) order by m.item_id limit 1`));
    await db.query(`insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 1, $2, 10) on conflict do nothing`, [me, item.item_id]).catch(() => {});
    await db.query(`insert into public.account_bank (user_id, item_id, qty, updated_at) values ($1, $2, 9, now())`, [me, item.item_id]);
    await db.query(`insert into public.market_listings (user_id, slot, source, item_id, qty, qty_listed, ask_each, fee, expires_at) values ($1, 0, 'storage', $2, 2, 2, $3::bigint, 1, now() + interval '1 day')`, [me, item.item_id, item.f]);
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value) values ($1, 0, 'flag', 'character_slot:2', '', 1)`, [me]);
    const held = await sql(`select (select count(*)::int from public.hunt_sessions where user_id = $1 and ended_at is null) open, (select count(*)::int from public.market_listings where user_id = $1) listed,
      (select client_state from public.player_state where user_id = $1 and slot = 0) residue, public.hr_hero_slots_of($1::uuid) slots, (select count(*)::int from public.player_ledger where user_id = $1) ledger`, [me]);
    step('WW-1 a played veteran: an open hunt, a listing, a bought slot, a ledger and residue on the server', held.open === 1 && held.listed === 1 && held.slots.length === 3 && held.ledger > 0 && held.residue.coach && Array.isArray(held.residue.huntSummaries || []) && Object.keys(held.residue).length >= 3,
      JSON.stringify({ ...held, residue: Object.keys(held.residue) }));
    await shot(page, 'veteran-before');
    const oldSession = (await sql(`select id from public.hunt_sessions where user_id = $1 and ended_at is null`, [me])).id;
    /* A second tab of the same browser, which stays open through it all. The first one reloads the moment it's over: its record of what
       it had open is intact, so that reload takes the path today's build takes (its hero doesn't load, the list is drawn). */
    const tab2 = await page.context().newPage();
    tab2.on('pageerror', (e) => p.errors.push('tab2 pageerror: ' + e.message));
    await tab2.goto(world.url, { waitUntil: 'load' });
    await tab2.waitForSelector('.char-row, .hs-launchers');
    if (await tab2.$('[data-app="play"]')) await tab2.click('[data-app="play"]');
    await tab2.waitForSelector('.hs-launchers');

    /* WW-2: closed, as production is; the allowlist as the five accounts are */
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'char-wipe-world: played')`, [me]);
    await db.query(`update public.hr_flags set enabled = true where key = 'closed_mode'`);
    const allow0 = (await sql(`select count(*)::int n from public.hr_access_allowlist`)).n;
    const order = ['2027-02-14-market-off.sql', '2027-02-20-market-wipe.sql', '2027-02-25-character-wipe.sql', '2027-02-20-market-wipe-resume.sql', '2027-02-14-market-on.sql'];
    for (const f of order) await apply(f);
    const after = await sql(`select (select count(*)::int from public.player_state) heroes, (select count(*)::int from public.hunt_sessions) sessions, (select count(*)::int from public.hunt_instances) instances,
      (select count(*)::int from public.market_listings) listings, (select count(*)::int from public.player_ledger) ledger, (select count(*)::int from public.account_wallet) purses,
      (select count(*)::int from public.leaderboard_ranked) board, (select enabled from public.hr_market_config) market, (select count(*)::int from cron.job where jobname = 'hr-market-expire') sweep, public.hr_hero_slots_of($1::uuid) slots`, [me]);
    step('WW-2 the procedure in order, with a hunt running and the page open: empty, two slots, the market back on', after.heroes === 0 && after.sessions === 0 && after.instances === 0 && after.listings === 0 && after.ledger === 0 && after.purses === 0 && after.board === 0 && after.market === true && after.sweep === 1 && after.slots.length === 2,
      JSON.stringify(after));

    /* WW-5, first: the reload with the tab's own record still saying "hero 0, shown". */
    const record = await page.evaluate(() => Object.keys(sessionStorage).map((k) => k + '=' + sessionStorage.getItem(k)).filter((s) => /"viewed":0/.test(s)).length);
    await p.reload();
    await page.waitForSelector('.char-row');
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('.char-row')).map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    await shot(page, 'characters-after');
    const screenText = await p.text();
    step('WW-5 the reload with the old "hero 0" record: the characters screen, two empty slots, nothing of Marlow, nothing said about it', record === 1 && rows.length === 2 && rows.every((r) => /Create hero/.test(r)) && !/Marlow/.test(screenText) && !SAYS_WHAT_HAPPENED.test(screenText), JSON.stringify({ record, rows, screenText: screenText.slice(0, 300) }));

    /* WW-3: the 10 s tick and every job */
    const answers = [];
    for (let i = 0; i < 3; i++) answers.push(...await world.tick());
    const jobs = (await db.query(`select jobname from cron.job order by jobname`)).rows.map((r) => r.jobname);
    const jobBad = [];
    for (const j of jobs) { try { await world.cron(j); } catch (e) { jobBad.push(j + ': ' + String(e.message).slice(0, 140)); } }
    const ghost = await sql(`select (select count(*)::int from public.player_state) heroes, (select count(*)::int from public.hunt_sessions) sessions, (select count(*)::int from public.hunt_instances) instances`);
    step('WW-3 the real tick and every scheduled job answer on the empty world; nothing came back', answers.every((a) => a.status === 200) && !jobBad.length && ghost.heroes === 0 && ghost.sessions === 0 && ghost.instances === 0, JSON.stringify({ answers: answers.slice(0, 3), jobBad, ghost }));

    /* WW-4: the tab that stayed open, once it has asked */
    const landed = await tab2.waitForSelector('.char-row, [data-app="create"]', { timeout: 90000 }).then(() => true, () => false);
    const tabText = await tab2.evaluate(() => document.body.innerText.slice(0, 200));
    await shot(tab2, 'stale-tab');
    step('WW-4 a tab left open through it comes to the characters screen on its own', landed, tabText);
    await tab2.close();

    /* WW-6: the control is a brand-new account on its first run through the same screens */
    await db.query(`update public.hr_flags set enabled = false where key = 'closed_mode'`);
    const f = await world.play({ account: 'newcomer', viewport: { width: 1366, height: 768 } });
    await f.createHero('Fern');
    await f.page.waitForTimeout(1500);
    const control = await first(f.page);
    const newcomerId = (await sql(`select id from auth.users where email like 'newcomer@%'`)).id;
    await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'char-wipe-world: newcomer') on conflict do nothing`, [newcomerId]);
    await db.query(`update public.hr_flags set enabled = true where key = 'closed_mode'`);
    await page.click('[data-app="create"][data-slot="0"]');
    await page.fill('.hero-name', 'Marlow');
    await page.click('.hero-confirm');
    await page.waitForSelector('#panel-world[data-slot="0"] .world-stage canvas');
    await page.waitForSelector('.hs-launchers');
    await page.waitForTimeout(1500);
    const mine = await first(page);
    await shot(page, 'new-hero');
    const screen = await page.evaluate(() => ({ summary: !!document.querySelector('[data-hs-win="hunt-summary"]'), death: !!document.querySelector('[data-hs-win="death"]'), text: document.body.innerText }));
    const moved = await page.evaluate(() => { const w = document.querySelector('[data-hs-win="chat"]'); return w ? w.style.transform || '' : ''; });
    step('WW-6 the old name is free and a new hero in slot 0 gets the first card a brand-new account gets; no summary, no death, no away line, nothing said', control && mine && mine.id === control.id && !screen.summary && !screen.death && !/While you were away/.test(screen.text) && !SAYS_WHAT_HAPPENED.test(screen.text),
      JSON.stringify({ control, mine, screen: { ...screen, text: screen.text.slice(0, 300) }, moved }));

    /* WW-7 */
    const residue = (await sql(`select client_state from public.player_state where user_id = $1 and slot = 0`, [me])).client_state;
    const flat = JSON.stringify(residue);
    const stale = flat.includes('old_card') || (residue.huntSummaries && residue.huntSummaries.length > 0) || flat.includes(oldSession) || /"s":"old"/.test(flat);
    /* A brand-new account's hero and this one start level: the same purse, the same bag, the same gear, the same stamina's cap. */
    const start = async (u) => (await db.query(`select (select gold::text from public.account_wallet where user_id = $1) gold,
      (select coalesce(string_agg(item_id || ':' || qty, ',' order by item_id), '') from public.player_inventory where user_id = $1 and slot = 0) bag,
      (select coalesce(string_agg(equip_slot || ':' || item_id, ',' order by equip_slot), '') from public.player_equipment where user_id = $1 and slot = 0) gear,
      (select level_xp::text from public.player_state where user_id = $1 and slot = 0) xp`, [u])).rows[0];
    const [startMine, startNew] = [await start(me), await start(newcomerId)];
    step('WW-7 the new hero\'s residue holds none of the old cards, summaries or stamps, and it starts level with a brand-new account\'s', !stale && JSON.stringify(startMine) === JSON.stringify(startNew) && startMine.bag.length > 0, JSON.stringify({ flat: flat.slice(0, 300), startMine, startNew }));
    const levelAtStart = (await sql(`select level_xp::bigint xp, public.hr_level_of($1::uuid, 0) lv from public.player_state where user_id = $1 and slot = 0`, [me]));

    /* WW-8: the real engine */
    await page.click('[data-hs-open="hunts"]');
    await page.click('.hw-hunt[data-hunt="mill_cellar"]');
    await page.click('.hw-hunt-enter');
    await page.waitForSelector('[data-hs-act="leave"]');
    await world.skip(8);
    const fought = await sql(`select level_xp::bigint xp, (select count(*)::int from public.player_ledger where user_id = $1 and kind = 'hunt') windows from public.player_state where user_id = $1 and slot = 0`, [me]);
    await page.click('[data-hs-act="leave"]');
    const summed = await page.waitForFunction(() => /Mill Cellar/.test(document.querySelector('.hsum-card .hsum-title')?.textContent || ''), null, { timeout: 60000 }).then(() => true, () => false);
    await shot(page, 'first-summary');
    step('WW-8 Level 1, and the real engine fights its first hunt through to a summary', levelAtStart.lv === 1 && Number(fought.xp) > Number(levelAtStart.xp) && summed, JSON.stringify({ levelAtStart, fought, summed }));

    /* WW-9 */
    const s = await world.play({ account: 'stranger', viewport: { width: 1366, height: 768 } });
    const notice = await s.page.waitForSelector('[data-closed-notice]').then(() => s.page.evaluate(() => document.querySelector('.auth-id-value').textContent), () => null);
    const strangerId = (await sql(`select id from auth.users where email like 'stranger@%'`)).id;
    const allow1 = (await sql(`select count(*)::int n from public.hr_access_allowlist`)).n;
    await shot(s.page, 'closed-notice');
    step('WW-9 an account on no list lands on the closed notice with its id; the allowlist moved only by this walk\'s own newcomer', notice === strangerId && allow1 === allow0 + 1, JSON.stringify({ notice, strangerId, allow0, allow1 }));

    /* WW-10 */
    const benign = (e) => /401|403|429|Failed to load resource/.test(e);
    const errors = [...p.errors, ...f.errors, ...s.errors].filter((e) => !benign(e));
    step('WW-10 no console errors, nothing left the machine', errors.length === 0 && p.offsite.length === 0 && world.offsite.length === 0, [...errors.slice(0, 6), ...p.offsite.slice(0, 3), ...world.offsite.slice(0, 3)].join(' | '));
  } finally {
    await world.close();
  }
}

try {
  await main();
} catch (e) {
  console.error('char-wipe-world: ' + (e && e.stack || e));
  process.exit(fails.length ? 1 : 2);
}
console.log(fails.length ? 'char-wipe-world: RED (' + fails.length + ')' : 'char-wipe-world: green');
process.exit(fails.length ? 1 : 0);
