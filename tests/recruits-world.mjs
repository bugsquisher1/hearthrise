#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/recruits-world.mjs — ONE HERO, LEVEL 5, ONE PRESS, FOUR HEROES: THE RECRUITS PLAYED IN THE REAL GAME, NO PRODUCTION.
//
//   node tests/recruits-world.mjs [--shots DIR]     exit 0 green, 1 red, 2 harness
//
// Tyler RD-Q6 a (2026-11-22): "One hero, then three recruits in one press at Level 5, near the first hero's Level". tools/qa/local-world.mjs:
// the real play.html and hr-accrue engine on the replayed chain, a brand-new account from the sign-in screen. A manual tool like
// tests/end-card-world.mjs (tests/guards-unregistered.json); the rules are mutation-proven in CI by tests/recruits.mjs (the server),
// tests/needs-you.mjs NY-RECRUITS, tests/client-boot-pure.mjs B-9r and tests/hunt-core/sewer.mjs (the coach card and the What next line).
//   RW-1  the first screen of a new account is ONE empty slot to make a hero in, and no other
//   RW-2  the hero's Mill Cellar ends itself at Level 5; the end card's gold press is Recruit your party, a link to All characters
//   RW-3  All characters holds the press: three rows (a shield, a healer, a bow, the server's jobs for a Club hero), the press on
//   RW-4  ONE press with one name typed: four heroes in the strip, the server holds four heroes at Level 5 with the typed name kept,
//         and the press is gone (the window's block and the server's section)
//   RW-5  RELOAD: the four heroes come back from the server, and the characters screen lists four heroes and no empty slot
//   RW-6  no console error, nothing left the machine
// mutant-anchors: none — a manual walk of the real game; the rules are mutation-proven in tests/recruits.mjs and the guards named above
// ════════════════════════════════════════════════════════════════════════
import { resolve as resolvePath } from 'node:path';
import { openWorld } from '../tools/qa/local-world.mjs';

const args = process.argv.slice(2);
const shots = args.includes('--shots') ? resolvePath(args[args.indexOf('--shots') + 1]) : null;
const fails = [];
const t0 = Date.now();
const step = (name, ok, got) => {
  console.log((ok ? '  ok   ' : '  RED  ') + name + (ok ? '' : ' -- ' + String(got).slice(0, 600)) + '  (' + Math.round((Date.now() - t0) / 1000) + ' s)');
  if (!ok) fails.push(name);
};
const VIEW = { width: 1440, height: 900 };

const world = await openWorld({ tickMs: false });
let code = 0;
try {
  const sql = async (q, a) => (await world.db.query(q, a || [])).rows;
  const p = await world.play({ account: 'recruiter', viewport: VIEW, shots });

  // RW-1 one empty slot, and no other
  await p.page.waitForSelector('.char-row');
  const first = await p.page.evaluate(() => Array.from(document.querySelectorAll('.char-row')).map((li) => li.querySelector('.char-pick').getAttribute('data-slot') + ':' + li.textContent.replace(/\s+/g, ' ').trim()));
  step('RW-1 a new account sees one slot to make a hero in', first.length === 1 && /^0:.*Create hero$/.test(first[0]), JSON.stringify(first));
  await p.shot('first-screen');
  await p.createHero('Recra');
  const uid = (await sql('select id from auth.users where email = $1', [p.email]))[0].id;

  // RW-2 the Cellar to its own end at Level 5; the end card's gold press is the recruits
  await p.enterHunt('mill_cellar');
  await world.skip(5);
  await world.skip(10);
  const last = 'select end_reason, ended_at from public.hunt_sessions where user_id = $1 order by entered_at desc limit 1';
  let closed = (await sql(last, [uid]))[0];
  for (let i = 0; i < 8 && !closed.ended_at; i++) { await world.skip(5); closed = (await sql(last, [uid]))[0]; }
  step('CONTROL the Cellar ended itself (outgrown)', closed.end_reason === 'outgrown', JSON.stringify(closed));
  await p.page.waitForSelector('[data-hs-win="hunt-summary"] [data-hs-act="next-ground"]:not([hidden])', { timeout: 60000 });
  await p.page.waitForTimeout(800);
  const foot = await p.page.evaluate(() => { const b = document.querySelector('[data-hs-win="hunt-summary"] [data-hs-act="next-ground"]');
    return b && { text: b.textContent, gold: b.classList.contains('is-primary'), go: b.getAttribute('data-hs-goto') }; });
  step('RW-2 the end card\'s gold press is Recruit your party, to All characters', !!foot && foot.text === 'Recruit your party' && foot.gold && /^characters\|/.test(foot.go || ''), JSON.stringify(foot));
  await p.shot('end-card');

  // RW-3 All characters holds the press
  await p.page.click('[data-hs-win="hunt-summary"] [data-hs-act="next-ground"]');
  await p.page.waitForSelector('[data-hs-win="characters"] .hw-recruits:not([hidden]) [data-hs-act="recruit-go"]', { timeout: 20000 });
  const pane = await p.page.evaluate(() => { const el = document.querySelector('[data-hs-win="characters"] .hw-recruits');
    return { lead: el.querySelector('.hw-recruits-lead').textContent, jobs: Array.from(el.querySelectorAll('.hw-recruit-job b')).map((b) => b.textContent),
      press: el.querySelector('[data-hs-act="recruit-go"]').textContent, off: el.querySelector('[data-hs-act="recruit-go"]').disabled }; });
  step('RW-3 three recruits, a shield, a healer and a bow, the press on', pane.jobs.join() === 'Sword and shield,Staff,Bow and crossbow' && pane.press === 'Recruit 3 heroes' && !pane.off
    && /^3 recruits ready \(join Recra at Level 5\) · /.test(pane.lead), JSON.stringify(pane));
  await p.shot('recruit-pane');

  // RW-4 ONE press
  await p.page.fill('[data-hs-win="characters"] .hw-recruit-name >> nth=0', 'Brannoc');
  await p.page.click('[data-hs-win="characters"] [data-hs-act="recruit-go"]');
  const four = await p.page.waitForFunction(() => document.querySelectorAll('.char-tab[data-app="show"]').length === 4, null, { timeout: 30000 }).then(() => true, () => false);
  const held = await sql('select ps.slot, public.hr_level_of(ps.user_id, ps.slot) as level, n.name from public.player_state ps left join public.character_names n on n.user_id = ps.user_id and n.slot = ps.slot where ps.user_id = $1 order by ps.slot', [uid]);
  step('RW-4 one press: four heroes in the strip', four, JSON.stringify(await p.page.evaluate(() => Array.from(document.querySelectorAll('.char-tab')).map((t) => t.textContent.replace(/\s+/g, ' ').trim()))));
  step('RW-4 ...the server holds four heroes, the recruits at Level 5, the typed name kept', held.length === 4 && held.slice(1).every((h) => h.level === 5) && held[1].name === 'Brannoc', JSON.stringify(held));
  await p.page.waitForTimeout(800);
  const gone = await p.page.evaluate(() => { const el = document.querySelector('[data-hs-win="characters"] .hw-recruits'); return { hidden: !el || el.hidden, rows: el ? el.querySelectorAll('.hw-recruit').length : 0, msg: el ? el.querySelector('.hw-recruits-msg').textContent : '' }; });
  const section = (await sql('select public.hr_state_of($1, 0)->\'recruits\' as r', [uid]))[0].r;
  step('RW-4 ...the press is gone (the window and the server\'s section)', gone.rows === 0 && section === null && /^Joined: .* · Ready in town$/.test(gone.msg), JSON.stringify({ gone, section }));
  await p.shot('recruited');

  // RW-5 RELOAD
  await p.reload();
  const back = await p.page.waitForFunction(() => document.querySelectorAll('.char-tab[data-app="show"]').length === 4 || document.querySelectorAll('.char-row').length === 4, null, { timeout: 30000 }).then(() => true, () => false);
  step('RW-5 a reload brings the four heroes back', back, JSON.stringify(await p.page.evaluate(() => ({ tabs: document.querySelectorAll('.char-tab').length, rows: document.querySelectorAll('.char-row').length }))));
  await p.page.evaluate(() => { const b = document.querySelector('.char-tool[data-app="characters"]'); if (b) b.click(); });
  const list = await p.page.waitForFunction(() => document.querySelectorAll('.char-row').length > 0, null, { timeout: 20000 }).then(
    () => p.page.evaluate(() => ({ rows: document.querySelectorAll('.char-row').length, empty: document.querySelectorAll('.char-row.is-empty').length })), () => null);
  step('RW-5 ...the characters screen lists four heroes and no empty slot', !!list && list.rows === 4 && list.empty === 0, JSON.stringify(list));

  // RW-6
  step('RW-6 no console error', p.errors.length === 0, JSON.stringify(p.errors.slice(0, 3)));
  step('RW-6 nothing left the machine', p.offsite.length === 0, JSON.stringify(p.offsite.slice(0, 3)));
  await p.close();
} catch (e) {
  console.error('recruits-world: HARNESS ' + (e && e.stack || e));
  code = 2;
} finally {
  await world.close();
}
console.log(code ? 'recruits-world: HARNESS' : fails.length ? 'recruits-world: RED, ' + fails.length + ' step(s)' : 'recruits-world: one hero first; at Level 5 one press made the company in the real game');
process.exit(code || (fails.length ? 1 : 0));
