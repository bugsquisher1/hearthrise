#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/gm-tools-world.mjs — THE GAME MASTER WINDOW, PLAYED: A REAL PAGE, THE REAL ENGINE, A REAL PLAYER BESIDE HIM (tools/qa/local-world.mjs).
//
//   node tests/gm-tools-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//   A manual guard, like tests/char-wipe-world.mjs (a machine's first run replays the whole chain). The forged calls are tests/gm-tools.mjs.
//
//   GW-1  a brand-new account made GM (the tool's migration) gets the icon and the window; a player gets neither, and its page holds no window code
//   GW-2  Who's playing names the player on its job; Look reads the hero; every act's button is off until it applies
//   GW-3  Stop asks once more with the hero's name; the job stops, what it earned is in the player's bag, and the player's own page says idle
//   GW-4  Say: the player's chat reads "Game Master: ..."
//   GW-5  Mute: the player's chat box says why, in words; Unmute lifts it
//   GW-6  Grants: gold and a Level land on the GM's own hero and show on its page
//   GW-7  In town the player's page draws the GM's body with the gold plate
//   GW-8  Ban: the player's page lands on a plain notice, not the closed one; Unban lets it back in on reload
//   GW-9  The same window at 922x423 opens as a sheet and every part of it can be reached
//   GW-10 no console errors beyond the refusals this walk asks for; nothing left the machine
// ════════════════════════════════════════════════════════════════════════
import { join, resolve as resolvePath } from 'node:path';
import { mkdirSync } from 'node:fs';
import { openWorld } from '../tools/qa/local-world.mjs';
import { gmSql } from '../tools/gm-allow.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
let reds = 0;
const step = (name, ok, detail) => { console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || !detail ? '' : ' — ' + detail)); if (!ok) reds++; };
let n = 0;
const shot = async (page, name) => {
  if (!shots) return;
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: join(shots, String(++n).padStart(2, '0') + '-' + name + '.png') });
};
const WIN = '[data-hs-win="game-master"]';
const saidIs = (page, re) => page.waitForFunction(([w, src]) => new RegExp(src).test((document.querySelector(w + ' .gm-said') || {}).textContent || ''), [WIN, re.source], { timeout: 30000 });

async function main() {
  const world = await openWorld({ tickMs: false });
  const { db } = world;
  const sql = async (q, params) => (await db.query(q, params)).rows[0];
  try {
    /* GW-1: the player first, then a new account made GM by the migration the tool writes, before it has a hero. */
    const WINDOW_CODE = /game-master-body|gm-intents/;
    const asked = { player: [], gm: [] };
    const p = await world.play({ account: 'marlow', viewport: { width: 1366, height: 768 } });
    p.page.on('request', (r) => { if (WINDOW_CODE.test(r.url())) asked.player.push(r.url()); });
    await p.createHero('Marlow');
    const gm = await world.play({ account: 'warden', viewport: { width: 1440, height: 900 } });
    gm.page.on('request', (r) => { if (WINDOW_CODE.test(r.url())) asked.gm.push(r.url()); });
    const gmId = (await sql(`select id from auth.users where email like 'warden@%'`)).id;
    const pId = (await sql(`select id from auth.users where email like 'marlow@%'`)).id;
    await db.exec(gmSql(gmId, 'Game Master (played)', 'world.sql'));
    await gm.createHero('Warden');
    await gm.page.waitForSelector('[data-hs-open="game-master"]', { timeout: 30000 });
    await gm.page.click('[data-hs-open="game-master"]');
    await gm.page.waitForSelector(WIN + ' .gm-part');
    await shot(gm.page, 'gm-window');
    const noIcon = !(await p.page.$('[data-hs-open="game-master"]'));
    const preloaded = WINDOW_CODE.test(await p.page.evaluate(() => [...document.querySelectorAll('link[rel=modulepreload]')].map((l) => l.href).join(' ')));
    step('GW-1 the GM has the icon and the window; a player has neither, and its page asked for none of the window', noIcon && !preloaded && !asked.player.length && asked.gm.length >= 2, JSON.stringify({ noIcon, preloaded, asked }));

    /* GW-2: the player on a real job. */
    await p.page.click('[data-hs-open="skills-trade"]');
    await p.page.waitForSelector('[data-hs-win="skills-trade"]');
    const skill = await p.page.evaluate(() => document.querySelector('[data-hs-win="skills-trade"] [data-hs-act="open-skill"]').getAttribute('data-skill'));
    await p.page.click('[data-hs-win="skills-trade"] [data-hs-act="open-skill"][data-skill="' + skill + '"]');
    const row = await p.page.evaluate(() => { const b = document.querySelector('[data-hs-act="work-go"]:not([disabled])'); return b && b.getAttribute('data-id'); });
    if (!row) throw Object.assign(new Error('no job a fresh hero can start in ' + skill), { harness: true });
    await p.page.click('[data-hs-act="work-go"][data-id="' + row + '"]');
    await p.page.waitForFunction((id) => document.querySelector('[data-hs-act="work-stop"][data-id="' + id + '"]'), row);
    await p.page.click('[data-hs-open="skills-trade"]');
    await gm.page.click(WIN + ' [data-hs-act="gm-online"]');
    await gm.page.waitForSelector(WIN + ' .gm-pick');
    const listed = await gm.page.evaluate((w) => [...document.querySelectorAll(w + ' .gm-pick')].map((b) => b.textContent), WIN);
    await gm.page.fill(WIN + ' .gm-find', 'Marlow');
    await gm.page.click(WIN + ' [data-hs-act="gm-look"]');
    await gm.page.waitForFunction((w) => /Marlow/.test((document.querySelector(w + ' .gm-facts') || {}).textContent || ''), WIN);
    await shot(gm.page, 'gm-hero');
    const facts = await gm.page.evaluate((w) => document.querySelector(w + ' .gm-facts').textContent, WIN);
    const offWhenIdle = await gm.page.evaluate((w) => document.querySelector(w + ' [data-hs-act="gm-unmute"]').disabled && document.querySelector(w + ' [data-hs-act="gm-unban"]').disabled, WIN);
    step('GW-2 Who\'s playing names the player on its job; Look reads the hero; nothing to lift reads off', listed.some((t) => /Marlow/.test(t) && /Gathering|Crafting/.test(t)) && /Level 1/.test(facts) && /Gathering|Crafting/.test(facts) && offWhenIdle, JSON.stringify({ listed, facts, offWhenIdle }));

    /* GW-3: time passes on the job, then the stop. */
    await db.query(`update public.player_state set active_since = now() - interval '20 minutes', accrued_to = now() - interval '20 minutes' where user_id = $1 and slot = 0`, [pId]);
    const bagBefore = (await sql(`select coalesce(sum(qty), 0)::bigint q from public.player_inventory where user_id = $1 and slot = 0`, [pId])).q;
    await gm.page.fill(WIN + ' .gm-why', 'a QA check is blocked');
    await gm.page.click(WIN + ' [data-hs-act="gm-stop"]');
    await gm.page.waitForSelector(WIN + ' .gm-confirm:not([hidden])');
    const asks = await gm.page.evaluate((w) => document.querySelector(w + ' [data-hs-act="gm-yes"]').textContent, WIN);
    await shot(gm.page, 'gm-confirm-stop');
    await gm.page.click(WIN + ' [data-hs-act="gm-yes"]');
    await saidIs(gm.page, /stopped/);
    const stopped = await sql(`select active_kind, (select coalesce(sum(qty), 0)::bigint from public.player_inventory where user_id = $1 and slot = 0) q from public.player_state where user_id = $1 and slot = 0`, [pId]);
    const playerIdle = await p.page.waitForFunction(() => !document.querySelector('[data-hs-act="work-stop"]'), null, { timeout: 30000 }).then(() => true, () => false);
    const logged = await sql(`select count(*)::int n from public.hr_gm_log where actor = $1 and verb = 'stop' and target_user = $2 and reason = 'a QA check is blocked' and outcome = 'ok'`, [gmId, pId]);
    step('GW-3 Stop names the hero before it runs; the job stops, what it earned is in the bag, the player\'s page agrees, the log has it',
      asks === 'Stop Marlow' && stopped.active_kind === 'idle' && Number(stopped.q) > Number(bagBefore) && playerIdle && logged.n === 1, JSON.stringify({ asks, stopped, bagBefore, playerIdle, logged }));

    /* GW-3b: a hunt stops by the player's own leave, with the hunt viewed and with the browser closed (CLAUDE.md §4 both paths). */
    const ended = (u) => sql(`select end_reason, ended_at is not null done from public.hunt_sessions where user_id = $1 and slot = 0 order by entered_at desc limit 1`, [u]);
    const stopByWindow = async (name) => {
      await gm.page.fill(WIN + ' .gm-find', name);
      await gm.page.click(WIN + ' [data-hs-act="gm-look"]');
      await gm.page.waitForFunction(([w, nm]) => new RegExp(nm + ' .*(Cellar|Sewer|Thicket)').test((document.querySelector(w + ' .gm-facts') || {}).textContent || ''), [WIN, name]);
      await gm.page.fill(WIN + ' .gm-why', 'a hunt to stop');
      await gm.page.click(WIN + ' [data-hs-act="gm-stop"]');
      await gm.page.waitForSelector(WIN + ' .gm-confirm:not([hidden])');
      await gm.page.click(WIN + ' [data-hs-act="gm-yes"]');
      await saidIs(gm.page, /leaving its hunt/);
    };
    await p.enterHunt('mill_cellar');
    await world.skip(2);
    await stopByWindow('Marlow');
    await world.skip(2);
    const viewed = await ended(pId);
    const back = await p.page.waitForFunction(() => !document.querySelector('[data-hs-act="leave"]'), null, { timeout: 60000 }).then(() => true, () => false);
    const closed = await world.play({ account: 'sorrel', viewport: { width: 1280, height: 720 } });
    await closed.createHero('Sorrel');
    const closedId = (await sql(`select id from auth.users where email like 'sorrel@%'`)).id;
    await closed.enterHunt('mill_cellar');
    await world.skip(2);
    await closed.close();
    await stopByWindow('Sorrel');
    await world.skip(2);
    const away = await ended(closedId);
    const idle = await sql(`select public.hr_playing($1::uuid, 0) p`, [closedId]);
    step('GW-3b a hunt the GM stops ends "left", with the hunt viewed and with the browser closed, and the seat is free', viewed.done && viewed.end_reason === 'left' && back && away.done && away.end_reason === 'left' && idle.p === false, JSON.stringify({ viewed, back, away, idle }));
    await p.page.click('.hsum-card [data-hs-act], [data-hs-win="hunt-summary"] [data-hs-close]').catch(() => {});

    /* GW-4 */
    await p.page.click('[data-hs-open="chat"]');
    await p.page.waitForSelector('[data-hs-win="chat"]');
    await gm.page.fill(WIN + ' .gm-say', 'The world restarts in ten minutes.');
    await gm.page.click(WIN + ' [data-hs-act="gm-say"]');
    await saidIs(gm.page, /Said/);
    await p.page.click('[data-hs-win="chat"] [data-tab="system"]').catch(() => {});
    const heard = await p.page.waitForFunction(() => /Game Master: The world restarts in ten minutes\./.test(document.querySelector('[data-hs-win="chat"]').innerText), null, { timeout: 45000 }).then(() => true, () => false);
    await shot(p.page, 'player-hears-gm');
    step('GW-4 the player\'s chat reads the line as the Game Master\'s', heard);

    /* GW-5 */
    await gm.page.fill(WIN + ' .gm-find', 'Marlow');
    await gm.page.click(WIN + ' [data-hs-act="gm-look"]');
    await gm.page.waitForFunction((w) => /^Marlow/.test((document.querySelector(w + ' .gm-facts') || {}).textContent || ''), WIN);
    await gm.page.fill(WIN + ' .gm-why', 'spam in global');
    await gm.page.click(WIN + ' [data-hs-act="gm-mute"]');
    await gm.page.click(WIN + ' [data-hs-act="gm-yes"]');
    await saidIs(gm.page, /muted/);
    await p.page.click('[data-hs-win="chat"] [data-tab="global"]');
    await p.page.fill('[data-hs-win="chat"] .hc-field', 'anyone there');
    await p.page.press('[data-hs-win="chat"] .hc-field', 'Enter');
    const mutedWords = await p.page.waitForFunction(() => { const t = document.querySelector('[data-hs-win="chat"]').innerText; return /muted you/.test(t) ? t : null; }, null, { timeout: 20000 }).then((h) => h.jsonValue(), () => '');
    await shot(p.page, 'player-muted');
    await gm.page.fill(WIN + ' .gm-why', 'served');
    await gm.page.waitForFunction((w) => !document.querySelector(w + ' [data-hs-act="gm-unmute"]').disabled, WIN);
    await gm.page.click(WIN + ' [data-hs-act="gm-unmute"]');
    await saidIs(gm.page, /can chat again/);
    step('GW-5 a muted player\'s chat says why, in words; Unmute lifts it', /muted you/.test(mutedWords) && !(await sql(`select public.hr_chat_muted_until($1) u`, [pId])).u, mutedWords.slice(0, 200));

    /* GW-6 */
    await gm.page.fill(WIN + ' .gm-grant-why', 'testing a price');
    await gm.page.fill(WIN + ' .gm-gold', '75000');
    await gm.page.click(WIN + ' [data-hs-act="gm-give-gold"]');
    await saidIs(gm.page, /Gold given/);
    await gm.page.fill(WIN + ' .gm-level', '30');
    await gm.page.click(WIN + ' [data-hs-act="gm-give-level"]');
    await saidIs(gm.page, /Level raised/);
    await shot(gm.page, 'gm-granted');
    const mine = await sql(`select public.hr_level_of($1, 0) lv, (select gold::bigint from public.account_wallet where user_id = $1) g`, [gmId]);
    const shows = await gm.page.waitForFunction(() => /Lv\s+30/.test(document.body.innerText), null, { timeout: 15000 }).then(() => true, () => false);
    const realGold = await sql(`select gold::bigint g from public.account_wallet where user_id = $1`, [pId]);
    step('GW-6 gold and a Level land on the GM\'s own hero and show on its page; the player\'s purse is untouched', mine.lv === 30 && Number(mine.g) >= 75000 && shows && Number(realGold.g) < 75000, JSON.stringify({ mine, shows, realGold }));

    /* GW-7: both in town. The plate is a canvas mark, read from the cast the world draws. */
    await gm.page.click('[data-hs-open="game-master"]').catch(() => {});
    const look = await sql(`select look from public.town_bodies where user_id = $1 and slot = 0`, [gmId]);
    await shot(p.page, 'player-sees-gm-in-town');
    step('GW-7 the server stamps the GM\'s body in town, so the player\'s town draws the gold plate', look && look.look && look.look.gm === true, JSON.stringify(look));

    /* GW-8 */
    await gm.page.click('[data-hs-open="game-master"]').catch(() => {});
    await gm.page.waitForSelector(WIN + ' .gm-part');
    await gm.page.fill(WIN + ' .gm-why', 'rmt spam');
    await gm.page.waitForFunction((w) => !document.querySelector(w + ' [data-hs-act="gm-ban"]').disabled, WIN);
    await gm.page.click(WIN + ' [data-hs-act="gm-ban"]');
    await gm.page.waitForSelector(WIN + ' .gm-confirm:not([hidden])');
    await shot(gm.page, 'gm-confirm-ban');
    await gm.page.click(WIN + ' [data-hs-act="gm-yes"]');
    await saidIs(gm.page, /banned/);
    await p.reload().catch(() => {});
    const noticed = await p.page.waitForSelector('[data-banned-notice]', { timeout: 30000 }).then(() => true, () => false);
    await shot(p.page, 'player-banned');
    const words = await p.page.evaluate(() => (document.querySelector('[data-banned-notice]') || {}).innerText || '');
    await gm.page.fill(WIN + ' .gm-why', 'appeal heard');
    await gm.page.waitForFunction((w) => !document.querySelector(w + ' [data-hs-act="gm-unban"]').disabled, WIN);
    await gm.page.click(WIN + ' [data-hs-act="gm-unban"]');
    await saidIs(gm.page, /can play again/);
    await p.page.reload({ waitUntil: 'load' });
    const again = await p.page.waitForSelector('.char-row, .hs-launchers', { timeout: 30000 }).then(() => true, () => false);
    step('GW-8 a banned player reads a plain notice; Unban lets it back in', noticed && /banned/.test(words) && !/hr_banned/.test(words) && again, JSON.stringify({ noticed, words: words.slice(0, 120), again }));

    /* GW-9: the phone's sheet. */
    const ph = await world.play({ account: 'warden', viewport: { width: 922, height: 423 }, touch: true });
    await ph.page.waitForSelector('.char-row, .hs-launchers');
    if (await ph.page.$('[data-app="play"][data-slot="0"]')) { await ph.page.click('[data-app="play"][data-slot="0"]'); await ph.page.waitForSelector('.hs-launchers'); }
    /* A phone's row holds no icon for it: All characters names it under "Also here" (src/data/shell-windows.js phoneIcon). */
    await ph.page.keyboard.press('o');
    let opened = false;
    const named = await ph.page.waitForSelector('.hw-icon-names [data-hs-open="game-master"]', { timeout: 15000 }).catch(() => null);
    if (named) { await named.click(); opened = true; }
    await ph.page.waitForSelector(WIN + ' .gm-part', { timeout: 15000 }).catch(() => { opened = false; });
    await shot(ph.page, 'gm-sheet-922x423');
    const reach = await ph.page.evaluate((w) => { const s = document.querySelector(w); if (!s) return null; const parts = [...s.querySelectorAll('.gm-part')]; return { parts: parts.length, wide: s.getBoundingClientRect().width <= innerWidth, heads: parts.map((x) => x.querySelector('.hs-sub').textContent) }; }, WIN);
    await ph.page.evaluate((w) => { const l = document.querySelector(w + ' .gm-part:last-of-type'); if (l) l.scrollIntoView(); }, WIN);
    await shot(ph.page, 'gm-sheet-922x423-foot');
    step('GW-9 at 922x423 the window opens as a sheet and every part is there', opened && reach && reach.parts === 4 && reach.wide, JSON.stringify(reach));

    /* GW-10 */
    const benign = (e) => /401|403|400|409|429|Failed to load resource/.test(e);
    const errors = [...p.errors, ...gm.errors, ...ph.errors].filter((e) => !benign(e));
    step('GW-10 no console errors, nothing left the machine', errors.length === 0 && p.offsite.length === 0 && gm.offsite.length === 0 && world.offsite.length === 0, JSON.stringify(errors.slice(0, 6)));
  } catch (e) {
    if (e.harness) { console.error('gm-tools-world: HARNESS — ' + e.message); process.exitCode = 2; return; }
    console.error(e);
    process.exitCode = 1;
    return;
  } finally {
    await world.close();
  }
  console.log(reds ? `\ngm-tools-world: RED (${reds})` : '\ngm-tools-world: green');
  process.exitCode = reds ? 1 : 0;
}

await main();
