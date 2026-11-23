#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/away-recap-world.mjs — "WHILE YOU WERE AWAY", PLAYED: REAL ABSENCES, THE REAL GAME, NO PRODUCTION.
//
//   node tests/away-recap-world.mjs [--shots DIR] [--only AR-6,AR-9]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and engine on the replayed chain, a real closed tab (with its goodbye), and
// world.wait(n, { away: true }) for the absence. Needs Node 23.6+ and, on a machine's first run, about 6 min to replay the chain;
// so it is a manual tool (tests/guards-unregistered.json). The rules are mutation-proven in CI by tests/shell-core.mjs R3 and
// tests/hud-reachable.mjs HR-7, HR-9. The crafter's and the friends' panels, 2026-11-01:
//   AR-1  a hero who has only ever gathered, away 8 h at a rock: the ore gained, Mining from and to, the job's count done (1026-job-counts.sql:
//         a gathering job ends), the hero waiting in town. No hunt named.
//   AR-2  the hunt ended before the player left, then a gathering job: the line is the job's and never names the hunt
//   AR-3  a bench run that runs out while away: what it made, the level gained, when and why it stopped, no "still"
//   AR-4  a hunt that ended before the player left, then nothing: no line at all
//   AR-5  a job stopped in view, then away: no line at all
//   AR-6  a hunt still running: only what the absence earned, not the whole hunt (the goodbye stamps the numbers on the way out)
//   AR-6b the same with the goodbye LOST (every residue put dropped at the close, a crash's case): the server's watched mark
//         (1060-watched-stamp.sql) is the baseline, so the thirty watched minutes before the close are not counted as away
//   AR-7  a page left open is not an absence: no line through a long skip
//   AR-8  nothing left the machine, and no console error but the harness's
//   AR-9  THE CARD, PLAYED (UI audit 2026-11-18 #2): a hunt that ran out of stamina with the page closed comes back as ONE card, the result
//         first ("Level 1 → n", the Level XP), why and when it ended; no hunt summary beside it; Carry on is the card's gold press (Tyler
//         27-1), the hero's own Hunt again starts the hunt on the server and the card goes
//   AR-10 THE YARD TOOK OVER (full-game audit 2026-11-18 A2): a hunt that died with the page closed and went on to the yard ("When the hunt
//         ends: Train Melee") comes back as its card: the Levels, the death and what the Blessings saved, then the yard, still training
//   AR-11 THE CELLAR OUTGROWN (the board's 2026-11-19 complete balance look, change 1; hunt-grounds.js endsAtLevel): a fresh hero's Cellar ends
//         at Level 5 with the page closed; the card says why ("Ground outgrown"), its press is Go to the next ground (audit 2026-11-19 L2), never
//         Hunt again, and the summary leads with Recruit your party (recruits at Level 5) with "Go on alone to" the next ground beside it
// AR-6 and AR-9 hunt the Thicket at Level 6 (the Cellar's hunt ends at 5, so a fresh hero's Cellar can no longer run for hours).
// The return is its own card (src/shell/windows/away.js): every check reads the card, never the alert lines.
// mutant-anchors: none — a manual walk of the real game; the rules are mutation-proven in shell-core.mjs and hud-reachable.mjs
// ════════════════════════════════════════════════════════════════════════
import { resolve as resolvePath } from 'node:path';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
/* --only AR-6[,AR-9]: run those sections alone (AR-8 always), e.g. to repeat one */
const only = args.includes('--only') ? String(args[args.indexOf('--only') + 1] || '').split(',') : null;
const want = (id) => !only || only.includes(id);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 500)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};
const VIEW = { width: 1440, height: 900 };

const world = await openWorld({ tickMs: false });
const errors = [];
const offsite = [];
const open = async (account) => {
  const p = await world.play({ account, viewport: VIEW, shots });
  p.page.on('pageerror', (e) => errors.push(account + ': ' + e.message));
  return p;
};
const enter = async (account) => {
  const p = await open(account);
  await p.page.click('[data-app="play"][data-slot="0"]');
  await p.page.waitForSelector('.hs-launchers');
  return p;
};
/* The player's two presses: the Work window on this skill, this row's Start. */
const startWork = async (p, skill, row) => {
  if (!(await p.page.$('[data-hs-win="skills-trade"]'))) await p.page.click('[data-hs-open="skills-trade"]');
  await p.page.waitForSelector('[data-hs-win="skills-trade"]');
  const back = await p.page.$('[data-hs-act="work-back"]');
  if (back && await back.isVisible()) await back.click();
  await p.page.click('[data-hs-win="skills-trade"] [data-hs-act="open-skill"][data-skill="' + skill + '"]');
  await p.page.click('[data-hs-act="work-go"][data-id="' + row + '"]');
  await p.page.waitForFunction((id) => document.querySelector('[data-hs-act="work-stop"][data-id="' + id + '"]'), row);
  await p.page.click('[data-hs-open="skills-trade"]');
  await p.page.waitForFunction(() => !document.querySelector('[data-hs-win="skills-trade"]'));
};
/* A real goodbye: the tab closes, the stamp and the debounce go on the way out. A minute after the last stamp, as a real close is. */
/* `goodbye`: the stamp must be the one written on the way out (AR-6, 2026-11-22: "some stamp exists" passed on the hunt's first in-view stamp
   while the goodbye was lost, and the card then counted the watched hunt). This account's own row, dated at the close, not a minute before. */
const leave = async (p, stampKey, { goodbye = false } = {}) => {
  await p.page.waitForTimeout(2500);
  const closedAt = Date.now();
  await p.page.close({ runBeforeUnload: true });
  await new Promise((ok) => setTimeout(ok, 800));
  if (stampKey) {
    const r = await world.db.query(`select (s.client_state->'awaySeen'->>'at')::bigint as at from public.player_state s join auth.users u on u.id = s.user_id
      where u.email = $1 and s.client_state->'awaySeen'->>'s' like $2`, [p.email, stampKey]);
    const at = r.rows.length ? Number(r.rows[0].at) : NaN;
    step('CONTROL the ' + (goodbye ? 'goodbye ' : '') + 'stamp ' + stampKey + ' landed on the server', r.rows.length === 1 && (!goodbye || at >= closedAt - 5000),
      JSON.stringify({ rows: r.rows, closedAt }));
  }
};
const cardOf = async (p, ms = 15000) => {
  try { await p.page.waitForFunction(() => /\bAway \d/.test(document.querySelector('[data-hs-win="away"] .haway-gone')?.textContent || ''), null, { timeout: ms }); } catch { return null; }
  await p.page.waitForTimeout(400);
  return p.page.evaluate(() => document.querySelector('[data-hs-win="away"] [data-hs-body]')?.innerText.replace(/\s+/g, ' ').trim() || null);
};
const noCard = async (p) => { await p.page.waitForTimeout(6000); return cardOf(p, 500); };
/* The setup a player reaches in hours, as this world's own rows (AR-10's way): a Level, and gold for the store's food. */
const levelTo = async (p, L, gold) => {
  const uid = (await world.db.query('select id from auth.users where email = $1', [p.email])).rows[0].id;
  await world.db.query('update public.player_state set level_xp = public.hr_char_xp_for_level($2) where user_id = $1', [uid, L]);
  if (gold) await world.db.query('update public.account_wallet set gold = $2 where user_id = $1', [uid, gold]);
  await p.reload();
  if (!(await p.page.$('.hs-launchers'))) await p.page.click('[data-app="play"][data-slot="0"]');
  await p.page.waitForSelector('.hs-launchers');
};

try {
  if (want('AR-1')) { // AR-1 a hero who has only ever gathered
    const p = await open('gatherer');
    await p.createHero('Tessel');
    await startWork(p, 'mining', 'copper_rock');
    await leave(p, 'town:gather:copper_rock');
    await world.wait(480, { away: true });
    const q = await enter('gatherer');
    const line = await cardOf(q, 30000);
    await q.shot('ar1-gathered');
    /* a gathering job carries a count (1026-job-counts.sql; the Work window's default, hunt-after.js GATHER_COUNT_DEFAULT 100): eight hours
       finish it, so the card says how many of how many and that the hero waits in town, never "Still mining" */
    step('AR-1 eight hours at a rock are told', !!line && /^Away 8 h \d+ min Tessel Tessel mined the Copper Rock\. \+100 Copper Ore, Mining 1 to \d+\. Done, 100 of 100\. Waiting in town\./.test(line)
      && !/Still mining|hunt/i.test(line), line);
    await q.close();
  }

  if (want('AR-2')) { // AR-2 a hunt that ended before the player left, then a job
    const p = await open('mixer');
    await p.createHero('Mixer');
    await p.enterHunt('mill_cellar');
    await world.skip(12);
    await p.page.click('[data-hs-act="leave"]');
    await p.page.waitForSelector('[data-hs-win="hunt-summary"]', { timeout: 120000 });
    await p.page.keyboard.press('Escape');
    await startWork(p, 'mining', 'copper_rock');
    await leave(p, 'town:gather:copper_rock');
    await world.wait(180, { away: true });
    const q = await enter('mixer');
    const line = await cardOf(q, 30000);
    step('AR-2 the line is the job\'s and names no hunt', !!line && /mined the Copper Rock/.test(line) && !/hunted|Mill Cellar|hunt has ended/.test(line), line);
    await q.close();
  }

  if (want('AR-3')) { // AR-3 a bench run that runs out while away
    const p = await open('benchhand');
    await p.createHero('Benchy');
    await startWork(p, 'woodcutting', 'normal_tree');
    await world.wait(30);
    await p.page.waitForTimeout(1000);
    await startWork(p, 'crafting', 'saw_normal');
    await leave(p, 'town:artisan:saw_normal');
    await world.wait(480, { away: true });
    const q = await enter('benchhand');
    const line = await cardOf(q, 30000);
    await q.shot('ar3-bench');
    step('AR-3 the bench run is told, with when and why it stopped', !!line && /Benchy made Normal Plank\. \+[\d,]+ Normal Plank, Crafting \d+ to \d+\. It stopped about .+ in, out of Normal Log\./.test(line), line);
    await q.close();
  }

  if (want('AR-4')) { // AR-4 a hunt over before the player left, then nothing
    const p = await open('homebody');
    await p.createHero('Homer');
    await p.enterHunt('mill_cellar');
    await world.skip(12);
    await p.page.click('[data-hs-act="leave"]');
    await p.page.waitForSelector('[data-hs-win="hunt-summary"]', { timeout: 120000 });
    await p.page.waitForTimeout(1000);
    await leave(p);
    await world.wait(120, { away: true });
    const q = await enter('homebody');
    const line = await noCard(q);
    step('AR-4 a hunt that ended before the absence raises no line', line === null, line);
    await q.close();
  }

  if (want('AR-5')) { // AR-5 a job stopped in view, then away
    const p = await open('stopper');
    await p.createHero('Stopper');
    await startWork(p, 'mining', 'copper_rock');
    await p.page.click('[data-hs-open="skills-trade"]');
    await p.page.waitForSelector('[data-hs-act="work-stop"]');
    await p.page.click('[data-hs-act="work-stop"]');
    await p.page.waitForFunction(() => !document.querySelector('[data-hs-act="work-stop"]')?.offsetWidth);
    await leave(p, 'idle');
    await world.wait(120, { away: true });
    const q = await enter('stopper');
    const line = await noCard(q);
    step('AR-5 a job stopped before the absence raises no line', line === null, line);
    await q.close();
  }

  if (want('AR-6')) { // AR-6 a hunt still running: only the absence's earnings
    const xpOf = (page) => page.evaluate(() => { const t = document.querySelector('.ha-analyzer'); return t ? Number(((t.innerText.match(/Level XP\s+([\d,]+)/) || [])[1] || '').replace(/,/g, '')) : null; });
    const p = await open('hunter');
    await p.createHero('Hunter');
    await levelTo(p, 6, 20000);
    await p.enterHunt('meadowbrook_thicket');
    await p.page.waitForSelector('.ha-stats dd[data-stat="kills"]');
    await world.skip(30);
    await p.page.waitForTimeout(3000);
    /* the goodbye writes at most one stamp a minute: leave after that minute, as any real hunt is left */
    await p.page.waitForTimeout(62000);
    const before = await xpOf(p.page);
    await leave(p, '%-%-%-%-%', { goodbye: true });
    await world.wait(62, { away: true });
    const q = await enter('hunter');
    const line = await cardOf(q, 30000);
    /* the card docks where the analyzer stands: read it, then OK, then the analyzer's total */
    await q.page.click('[data-hs-win="away"] [data-hs-act="away-ok"]').catch(() => {});
    await q.page.waitForTimeout(1000);
    const gained = Number(((line || '').match(/Level XP \+([\d,]+)/) || [])[1]?.replace(/,/g, ''));
    const after = await xpOf(q.page);
    step('AR-6 the line reports the absence, not the whole hunt', !!line && before > 0 && gained > 0 && gained <= after - before + 200 && gained < after, JSON.stringify({ line, before, after, gained }));
    await q.close();
  }

  if (want('AR-6b')) { // AR-6b the goodbye lost (a crash, an OS kill): the card still reports only the absence
    const xpOf = (page) => page.evaluate(() => { const t = document.querySelector('.ha-analyzer'); return t ? Number(((t.innerText.match(/Level XP\s+([\d,]+)/) || [])[1] || '').replace(/,/g, '')) : null; });
    const p = await open('crasher');
    await p.createHero('Crasher');
    await levelTo(p, 6, 20000);
    await p.enterHunt('meadowbrook_thicket');
    await p.page.waitForSelector('.ha-stats dd[data-stat="kills"]');
    await world.skip(30);
    await p.page.waitForTimeout(3000);
    await p.page.waitForTimeout(62000);
    const before = await xpOf(p.page);
    /* THE GOODBYE NEVER LEAVES: every residue put is dropped from here, so the page's last stamp is its first in-view one, from before
       the thirty skipped minutes it watched. Only the server's watched mark (1060-watched-stamp.sql) knows the player watched them.
       Dropped in the page (server.js fetches through globalThis.fetch at the call): a route never sees a keepalive sent in the
       page's teardown (played 2026-11-22: the goodbye landed through a context route). */
    await p.page.evaluate(() => {
      const f = window.fetch;
      window.fetch = (u, i) => (/\/rpc\/hr_put_client_state/.test(String(u)) ? Promise.reject(new TypeError('dropped: the tab crashed')) : f(u, i));
    });
    const closedAt = Date.now();
    await p.page.close({ runBeforeUnload: true });
    await new Promise((ok) => setTimeout(ok, 800));
    const r = await world.db.query(`select (s.client_state->'awaySeen'->>'at')::bigint as at from public.player_state s join auth.users u on u.id = s.user_id
      where u.email = $1`, [p.email]);
    step('CONTROL the goodbye did not land (the page\'s stamp is older than the close)', r.rows.length === 1 && Number(r.rows[0].at) < closedAt - 30000, JSON.stringify({ rows: r.rows, closedAt }));
    await world.wait(62, { away: true });
    const q = await enter('crasher');
    const line = await cardOf(q, 30000);
    await q.page.click('[data-hs-win="away"] [data-hs-act="away-ok"]').catch(() => {});
    await q.page.waitForTimeout(1000);
    const gained = Number(((line || '').match(/Level XP \+([\d,]+)/) || [])[1]?.replace(/,/g, ''));
    const after = await xpOf(q.page);
    step('AR-6b a lost goodbye: the line reports the absence, not the watched skip', !!line && before > 0 && gained > 0 && gained <= after - before + 200 && gained < after, JSON.stringify({ line, before, after, gained }));
    await q.close();
  }

  if (want('AR-7')) { // AR-7 a page left open is not an absence
    const p = await open('watcher');
    await p.createHero('Watcher');
    await p.enterHunt('mill_cellar');
    await p.page.waitForSelector('.ha-stats dd[data-stat="kills"]');
    await p.page.waitForTimeout(1500);
    await world.wait(30, { away: true });
    const line = await noCard(p);
    step('AR-7 a page left open raises no line', line === null, line);
    await p.close();
  }
  if (want('AR-9')) { // AR-9 the card, played: a hunt that ran out of stamina with the page closed
    const p = await open('cardplay');
    await p.createHero('Cardy');
    await levelTo(p, 6, 20000);
    await p.enterHunt('meadowbrook_thicket');
    await world.skip(3);
    await leave(p, '%-%-%-%-%');
    await world.wait(840, { away: true });
    const q = await enter('cardplay');
    const line = await cardOf(q, 30000);
    const beside = await q.page.evaluate(() => ({ summary: !!document.querySelector('[data-hs-win="hunt-summary"]'), lines: document.querySelectorAll('.hw-alert[data-kind="away"]').length,
      /* the press a player sees (the phone foot holds a second copy, hidden on a desktop) */
      gold: Array.from(document.querySelectorAll('[data-hs-win="away"] button.is-primary')).filter((b) => b.offsetParent !== null).map((b) => b.textContent),
      /* the hero's own block (Needs you and Carry on sit above it on the card), and its own press */
      hero: document.querySelector('[data-hs-win="away"] .haway-hero')?.innerText.replace(/\s+/g, ' ').trim() || null,
      own: document.querySelector('[data-hs-win="away"] .haway-hero [data-hs-act="away-go"]')?.textContent || null }));
    await q.shot('ar10-card');
    /* Tyler 27-1 (2026-11-20, src/shell/carry-on.js): Carry on is the card's ONE gold press for the account; the hero's block keeps Hunt again */
    step('AR-9 one card: the hero\'s result first, why and when it ended, Carry on its gold press, Hunt again the hero\'s own, nothing beside it',
      /* Gold is what the purse kept, with the coins and the supplies under it (audit 2026-11-18 A6) */
      !!line && /^Away 14 h \d+ min /.test(line) && !!beside.hero
      && /^Cardy Meadowbrook Thicket Level 6 → \d+ Level XP \+[\d,]+ Gold [+−][\d,]+ gp [\d,]+ gp in coins(, [\d,]+ gp on supplies)? Kills [\d,]+/.test(beside.hero)
      && /Out of stamina, so Cardy came home\. Ended \d+ h \d+ min ago/.test(beside.hero)
      && !beside.summary && !beside.lines && JSON.stringify(beside.gold) === '["Carry on"]' && beside.own === 'Hunt again', JSON.stringify({ line, beside }));
    await q.page.click('[data-hs-win="away"] [data-hs-act="away-go"]');
    const went = await q.page.waitForFunction(() => !document.querySelector('[data-hs-win="away"]') && !!document.querySelector('[data-hs-act="leave"]'), null, { timeout: 30000 }).then(() => true, () => false);
    const open1 = (await world.db.query("select count(*)::int as n from public.hunt_sessions where ended_at is null and hunt_id = 'meadowbrook_thicket'")).rows[0].n;
    step('AR-9 Hunt again: the server starts the hunt, the card goes', went && open1 >= 1, JSON.stringify({ went, open1 }));
    await q.close();
  }
  if (want('AR-10')) { // AR-10 THE YARD TOOK OVER (full-game audit 2026-11-18 A2): a hunt that dies with the page closed and goes on to the yard keeps its card
    const p = await open('yardroll');
    await p.createHero('Yardley');
    /* the setup a player reaches in hours, as this world's own rows: Level 12 (the yard opens at 10), gold for its fee, three Blessings, and
       "When the hunt ends: Train Melee at the yard" (frozen on the hunt at Enter) */
    const uid = (await world.db.query('select id from auth.users where email = $1', [p.email])).rows[0].id;
    await world.db.query(`update public.player_state set level_xp = public.hr_char_xp_for_level(12), after_choice = 'train', after_skill = 'melee' where user_id = $1`, [uid]);
    await world.db.query('update public.account_wallet set gold = 50000 where user_id = $1', [uid]);
    for (const tier of [1, 2, 3]) await world.db.query(`insert into public.player_blessings (user_id, slot, tier, paid, bought_at) values ($1, 0, $2, 0, now() - interval '2 hours') on conflict do nothing`, [uid, tier]);
    await p.reload();
    if (!(await p.page.$('.hs-launchers'))) await p.page.click('[data-app="play"][data-slot="0"]');
    await p.page.waitForSelector('.hs-launchers');
    /* Hask's Ford, 33 Levels over: the one confirm, then Enter */
    await p.page.click('[data-hs-open="hunts"]');
    await p.page.click('.hw-hunt[data-hunt="hasks_ford"]');
    await p.page.click('.hw-hunt-enter');
    await p.page.waitForTimeout(500);
    if (!(await p.page.$('[data-hs-act="leave"]'))) await p.page.click('.hw-hunt-enter');
    await p.page.waitForSelector('[data-hs-act="leave"]');
    await leave(p, '%-%-%-%-%');
    await world.wait(40, { away: true });
    /* the plan's deferred start (pg_cron's hr-hunt-after: a wait runs no job) */
    await world.cron('hr-hunt-after');
    await world.wait(60, { away: true });
    const ran = (await world.db.query('select hunt_id, end_reason from public.hunt_sessions where user_id = $1 order by entered_at', [uid])).rows;
    step('CONTROL AR-10 the hunt died and the yard took over', ran.length === 2 && ran[0].end_reason === 'died' && ran[1].hunt_id === 'training_yard_melee', JSON.stringify(ran));
    const q = await enter('yardroll');
    const line = await cardOf(q, 30000);
    await q.shot('ar10-yard-took-over');
    step('AR-10 the card tells the hunt the yard took over: its Levels, the death and its Blessings, then the yard',
      !!line && /Yardley Hask's Ford Level 12 → 1[12]/.test(line) && /Yardley died in Hask's Ford\. Killed by .+\. Death cost: [\d,]+ Level XP/.test(line)
      && /3 Blessings saved [\d,]+ Level XP[^.]*, used up\./.test(line) && /Then Yardley went to the yard to train Melee\. Still training\./.test(line) && /Open Training/.test(line), line);
    await q.close();
  }
  if (want('AR-11')) { // AR-11 the Cellar outgrown with the page closed
    const p = await open('outgrow');
    await p.createHero('Sprout');
    await p.enterHunt('mill_cellar');
    const skipAt = Date.now();
    await world.skip(3);
    /* THE LEVEL THE PLAYER LAST SAW (1060-watched-stamp.sql): the viewed asks after the skip mark the hero as the page showed it, so
       the card counts from the last of them (the page's own stamp is the entry's, under a minute old at the close, and no goodbye is
       written over it: before the server's mark the card called the three watched minutes away, "Level 1 → 5") */
    for (let i = 0; i < 60; i++) {
      const m = (await world.db.query(`select 1 from public.hunt_watch w join auth.users u on u.id = w.user_id
        where u.email = $1 and w.at > to_timestamp($2::float8 / 1000)`, [p.email, skipAt])).rows[0];
      if (m) break;
      await p.page.waitForTimeout(500);
    }
    await leave(p, '%-%-%-%-%');
    const seenLv = ((await world.db.query(`select (w.mark->>'lv')::int as lv from public.hunt_watch w join auth.users u on u.id = w.user_id
      where u.email = $1 and w.at > to_timestamp($2::float8 / 1000)`, [p.email, skipAt])).rows[0] || {}).lv;
    step('CONTROL AR-11 a viewed ask after the skip marked the hero', Number.isInteger(seenLv), String(seenLv));
    await world.wait(180, { away: true });
    const uid = (await world.db.query('select id from auth.users where email = $1', [p.email])).rows[0].id;
    const ran = (await world.db.query('select end_reason from public.hunt_sessions where user_id = $1 order by entered_at', [uid])).rows;
    step('CONTROL AR-11 the Cellar ended outgrown', ran.length === 1 && ran[0].end_reason === 'outgrown', JSON.stringify(ran));
    const q = await enter('outgrow');
    const line = await cardOf(q, 30000);
    const gold = await q.page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="away"] button.is-primary')).filter((b) => b.offsetParent !== null).map((b) => b.textContent));
    await q.shot('ar11-outgrown');
    /* audit 2026-11-19 L2: the press is the next ground itself, the Hunt summary one press beside it */
    step('AR-11 the card says the ground was outgrown, and its press is Go to the next ground',
      !!line && new RegExp('Sprout Mill Cellar Level ' + seenLv + ' → 5\\b').test(line) && /Ground outgrown\./.test(line) && JSON.stringify(gold) === '["Go to Meadowbrook Thicket"]',
      JSON.stringify({ line, gold }));
    await q.page.click('[data-hs-win="away"] [data-hs-act="away-summary"]');
    const summary = await q.page.waitForFunction(() => { const w = document.querySelector('[data-hs-win="hunt-summary"]'); return w ? w.innerText.replace(/\s+/g, ' ') : null; }, null, { timeout: 30000 })
      .then((h) => h.jsonValue(), () => null);
    /* a fresh account's lone hero at Level 5 has recruits waiting (Tyler RD-Q6 a, 1052/1053; back-in-town.js `party`): the summary's foot
       leads with Recruit your party, and the next ground stays as its own row, "Go on alone to Meadowbrook Thicket" */
    step('AR-11 the summary names the Level and the next ground, leads with Recruit your party, and offers no Hunt again',
      !!summary && /Ground outgrown at Level 5/.test(summary) && /Go on alone to Meadowbrook Thicket/.test(summary)
      && await q.page.evaluate(() => { const w = document.querySelector('[data-hs-win="hunt-summary"]'), b = w.querySelector('[data-hs-act="again"]'), go = w.querySelector('[data-hs-act="next-ground"]');
        return (!b || b.hidden || b.disabled) && !!go && !go.hidden && go.classList.contains('is-primary') && go.textContent === 'Recruit your party'
          && !!w.querySelector('.hsum-step[data-step="ground"] [data-hs-act="town"]'); }),
      summary);
    await q.close();
  }
  step('AR-8 no page error', errors.length === 0, errors.join(' | '));
} catch (e) {
  console.error(e);
  await world.close().catch(() => {});
  process.exit(2);
}
await world.close();
console.log(fails.length ? 'away-recap-world: ' + fails.length + ' RED' : 'away-recap-world: the return tells what the absence did, gathering, bench or hunt, and nothing else');
process.exit(fails.length ? 1 : 0);
