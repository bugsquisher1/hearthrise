#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/honor-roll-world.mjs — THE ROLL OF HONOR, PLAYED: TWO ACCOUNTS, THE REAL GAME, NO PRODUCTION.
//
//   /opt/node24/bin/node tests/honor-roll-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// tools/qa/local-world.mjs: the real play.html and engine on the replayed chain (2027-02-12-leaderboard-heroes.sql
// included), brand-new accounts made from the sign-in screen. Needs Node 23.6+ (the engine is type-stripped) and,
// on a machine's first run, about 6 min to replay the chain; so it is a manual tool, like `local-world smoke`
// (tests/guards-unregistered.json), and the server half is guarded in CI by tests/leaderboard-server-source.mjs.
//
//   HW-1  two accounts each make a hero and hunt the Mill Cellar; a 10-minute skip settles both on the server
//   HW-2  Z opens the Roll of Honor with zero console errors; the Level board lists BOTH heroes by their own
//         names, in the server's order, each with the server's level ("Level N", hr_char_level of its Level XP)
//   HW-3  the viewer's own hero is marked "Your hero", the other is not; the count and "Updated" stamp show;
//         the line under the roll says where the viewer stands ("stands 2nd of 2" / "holds first place")
//   HW-4  an empty board (Fishing) says so honestly and tells the viewer how to get on; Total level lists both
//   HW-5  the second account reads the same roll on a phone (922x423, touch): the window is a sheet and its
//         own hero is the marked one
//   HW-6  a hidden account (hr_lb_hidden 'test', the cron's refresh) holds no place: the roll shows one hero
//   HW-7  nothing left the machine
// Screenshots (--shots): the roll at 1440x900 and at 922x423, and the empty board.
// mutant-anchors: none — a manual walk of the real game; the server rules are mutation-proven in leaderboard-server-source.mjs
// ════════════════════════════════════════════════════════════════════════
import { resolve as resolvePath } from 'node:path';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 400)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};

/* The roll as the window draws it: every line's place, name, value and mark, plus the words around it. */
const readRoll = (page) => page.evaluate(() => {
  const w = document.querySelector('[data-hs-win="honor"]');
  if (!w) return null;
  const line = (li) => ({ place: li.querySelector('.hr-place').textContent, name: li.querySelector('.hr-name b').textContent,
    tag: li.querySelector('.hr-name small').textContent, value: li.querySelector('.hr-val b').textContent,
    viewed: li.classList.contains('is-viewed') });
  return {
    title: w.querySelector('.hr-title').textContent,
    lines: Array.from(w.querySelectorAll('.hr-roll:not(.hr-near) > .hr-line')).map(line),
    count: w.querySelector('.hr-count').textContent,
    fresh: w.querySelector('.hr-fresh').textContent,
    empty: w.querySelector('.hr-empty.is-on') ? w.querySelector('.hr-empty').textContent : '',
    you: w.querySelector('.hr-you.is-on') ? w.querySelector('.hr-you-line').textContent : '',
    next: w.querySelector('.hr-you-next').textContent,
    width: Math.round(w.getBoundingClientRect().width), right: Math.round(w.getBoundingClientRect().right),
    bottom: Math.round(w.getBoundingClientRect().bottom), vw: innerWidth, vh: innerHeight,
  };
});
const ordinal = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th');
const waitRoll = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 30000 }).then(() => true, () => false);
const pick = async (page, board) => {
  await page.selectOption('[data-hs-win="honor"] select[data-hs-act="board"]', board);
  return waitRoll(page, (b) => {
    const w = document.querySelector('[data-hs-win="honor"]');
    return w && w.querySelector('select').value === b && !/Reading the roll/.test(w.querySelector('.hr-empty').textContent || '')
      && (w.querySelector('.hr-roll:not(.hr-near) > .hr-line') || w.querySelector('.hr-empty.is-on'));
  }, board);
};

const world = await openWorld({ tickMs: false });
step('world up: chain replayed and opened, engine loaded', true);
let code = 0;
try {
  const sql = async (q, a) => (await world.db.query(q, a)).rows;
  // ── HW-1 ──
  const a = await world.play({ account: 'honora', viewport: { width: 1440, height: 900 }, shots });
  await a.createHero('Brannoc');
  const b = await world.play({ account: 'honorb', viewport: { width: 922, height: 423 }, touch: true, shots });
  await b.createHero('Osric');
  await a.enterHunt('mill_cellar');
  await b.enterHunt('mill_cellar');
  await world.skip(5);
  const skipped = await world.skip(10);
  const heroesXp = () => sql(`select n.name, ps.level_xp::bigint as xp, public.hr_char_level(ps.level_xp) as level
                          from public.player_state ps join public.character_names n using (user_id, slot) order by ps.level_xp desc, n.name`);
  const before = await heroesXp();
  step('HW-1 both heroes hunted and the server settled them', skipped.lagMs < 100000 && before.length === 2 && before.every((r) => Number(r.xp) > 0),
    JSON.stringify({ skipped, before }));
  const ended = (p) => p.page.waitForFunction(() => /Mill Cellar/.test(document.querySelector('.hsum-card .hsum-title')?.textContent || ''),
    null, { timeout: 60000 }).then(() => true, () => false);
  await a.page.click('[data-hs-act="leave"]');
  await b.page.click('[data-hs-act="leave"]');
  const left = (await ended(a)) && (await ended(b));
  const open = await sql('select count(*)::int as n from public.hunt_sessions where ended_at is null');
  step('HW-1 both hunts ended (left)', left && open[0].n === 0, JSON.stringify(open));
  /* the cron's job (every 5 min on production; PGlite hosts no pg_cron): one forced rebuild of the boards */
  await sql('select public.hr_leaderboard_refresh(true)');
  const xp = await heroesXp();

  // ── HW-2 / HW-3 ──
  await a.page.keyboard.press('Escape');                 // the hunt summary
  await a.page.keyboard.press('z');
  const opened = await waitRoll(a.page, () => document.querySelectorAll('[data-hs-win="honor"] .hr-roll:not(.hr-near) > .hr-line').length === 2);
  const r1 = await readRoll(a.page);
  step('HW-2 Z opens the Roll of Honor on the Level board with both heroes', opened && r1 && r1.title === 'Level' && r1.lines.length === 2, JSON.stringify(r1));
  /* The server's order (rank: score, then a stable tiebreak) and its places (a tie is one place twice); each level must
     also be hr_char_level of that hero's Level XP in player_state, the column the settle writes. */
  const ranked = await sql(`select name, level, place from public.leaderboard_ranked where board = 'level' order by rank`);
  const want = ranked.map((r) => ordinal(Number(r.place)) + ' ' + r.name + ' Level ' + r.level);
  const levelsTrue = ranked.length === xp.length && ranked.every((r) => xp.some((h) => h.name === r.name && Number(h.level) === Number(r.level)));
  step('HW-2 the heroes by their own names, in the server\'s order and places, with the server\'s level', levelsTrue
    && r1 && r1.lines.map((l) => l.place + ' ' + l.name + ' ' + l.value).join() === want.join(), JSON.stringify({ got: r1 && r1.lines, want, xp }));
  const mineLine = r1 && r1.lines.find((l) => l.name === 'Brannoc');
  const theirs = r1 && r1.lines.find((l) => l.name === 'Osric');
  step('HW-3 the viewer\'s hero is marked "Your hero"; the other is not', mineLine && mineLine.viewed && mineLine.tag === 'Your hero'
    && theirs && !theirs.viewed && theirs.tag === '', JSON.stringify(r1 && r1.lines));
  const myPlace = xp[0].name === 'Brannoc' || xp[0].xp === xp[1].xp ? 1 : 2;
  step('HW-3 the count, the stamp and the standing line', r1 && r1.count === '2 heroes on this roll' && /^Updated (just now|\d+ minutes? ago)$/.test(r1.fresh)
    && (myPlace === 1 ? /^Brannoc (holds|shares) first place\.$/.test(r1.you) : /^Brannoc stands 2nd of 2\.$/.test(r1.you)
      && /^Osric, the next hero up, is [\d,]+ XP ahead\.$/.test(r1.next)), JSON.stringify(r1));
  await a.shot('honor-level-desktop');
  // ── HW-4 ──
  const fishing = await pick(a.page, 'skill:fishing');
  const r2 = await readRoll(a.page);
  step('HW-4 an empty board says so and tells the viewer how to get on', fishing && r2.lines.length === 0
    && r2.empty === 'No hero has trained Fishing yet. The first to do it takes first place.'
    && r2.you === 'Brannoc is not on this roll yet. Train Fishing to earn a place: fish at a fishing spot.', JSON.stringify(r2));
  await a.shot('honor-fishing-empty');
  const total = await pick(a.page, 'total_level');
  const r3 = await readRoll(a.page);
  step('HW-4 Total level lists both heroes', total && r3.lines.length === 2 && r3.lines.every((l) => /^Total level \d+$/.test(l.value)), JSON.stringify(r3));
  // ── HW-5 ──
  await b.page.keyboard.press('Escape');
  const launch = await b.page.$('[data-hs-open="honor"]');
  if (launch) await launch.click(); else await b.page.keyboard.press('z');
  const phone = await waitRoll(b.page, () => document.querySelectorAll('[data-hs-win="honor"] .hr-roll:not(.hr-near) > .hr-line').length === 2);
  await b.page.waitForTimeout(600);   // the 120 ms slide-in ends and the World makes room for the sheet
  const r4 = await readRoll(b.page);
  const osric = r4 && r4.lines.find((l) => l.name === 'Osric');
  step('HW-5 the phone (922x423) reads the same roll in a sheet, its own hero marked', phone && osric && osric.viewed && osric.tag === 'Your hero'
    && r4.width <= 400 && r4.right <= r4.vw && r4.bottom <= r4.vh, JSON.stringify(r4));
  await b.shot('honor-level-phone');
  // ── HW-6 ──
  await sql(`insert into public.hr_lb_hidden (user_id, slot, reason, note)
               select ps.user_id, null, 'test', 'honor-roll-world HW-6' from public.character_names ps where ps.name = 'Osric'`);
  await sql('select public.hr_leaderboard_refresh(true)');
  await a.page.evaluate(() => document.activeElement && document.activeElement.blur());   // keys go to the shell, not the picker
  await a.page.keyboard.press('Escape');
  await a.page.waitForFunction(() => !document.querySelector('[data-hs-win="honor"]'), null, { timeout: 5000 }).catch(() => {});
  await a.page.keyboard.press('z');
  const one = await waitRoll(a.page, () => {
    const w = document.querySelector('[data-hs-win="honor"]');
    return w && w.querySelector('select').value === 'total_level' && w.querySelectorAll('.hr-roll:not(.hr-near) > .hr-line').length === 1;
  });
  const r5 = await readRoll(a.page);
  step('HW-6 a hidden account holds no place', one && r5.lines.map((l) => l.name).join() === 'Brannoc' && r5.count === '1 hero on this roll', JSON.stringify(r5));
  // ── HW-7 ──
  step('HW-2 no console errors on either screen', a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 5).join(' | '));
  step('HW-7 nothing left the machine', a.offsite.length === 0 && b.offsite.length === 0 && world.offsite.length === 0,
    [...a.offsite, ...b.offsite, ...world.offsite].slice(0, 5).join(' | '));
} catch (e) {
  step('the walk finished', false, e && e.stack || e);
  code = 2;
} finally {
  await world.close();
}
console.log(fails.length ? 'honor-roll-world: RED (' + fails.length + ') in ' + Math.round((Date.now() - t0) / 1000) + ' s'
  : 'honor-roll-world: green in ' + Math.round((Date.now() - t0) / 1000) + ' s');
process.exit(fails.length ? (code || 1) : 0);
