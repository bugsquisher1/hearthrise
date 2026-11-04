#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/death-popup.mjs — THE DEATH POPUP (Tyler 2026-10-19; tracker r15), IN A REAL CHROMIUM.
//
//   node tests/death-popup.mjs                the rules
//   node tests/death-popup.mjs --mutate       every planted defect must turn a rule RED (--only TEXT: just the mutants whose name holds it)
//   node tests/death-popup.mjs --shots <dir>  also write the visual-gate screenshots (1440x900, 922x423)
//
// mutant-anchors: src/shell/death-popup.js src/shell/windows/death.js src/shell/alerts.js src/session/character-sections.js src/shell/widgets/hunt-topbar.js src/shell/shell.js src/styles/app.css src/world/world-boot.js src/hunt-view/summary-recorder.js
// mutant-writes-tree: no — page mutants are served overrides
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs), on
// tests/fixtures/party-envelope.json's slot 0 (hunting in The Sewer). The death row is the
// shape hr_death_log_view projects (2026-11-07-death-popup-blessing.sql, whose §2 proves
// the server half: the session and the Blessing's saving on each row).
//   DP-0 PURE      the words are the row's: no `saved` key says nothing about a Blessing,
//                  saved null says none was active, a saving names its XP; an unpriced row
//                  (xp null) says nothing about the cost
//   DP-1 ATTENDED  the hunt section ends `died` in a new envelope: the death popup opens,
//                  centred, and every line is the death row's (where, the killer, the XP
//                  dying cost, what the Blessing kept, back in town); no side alert line for
//                  it and no hunt summary over it; a reload before OK shows it again with the
//                  same cost; OK closes it and stores the dismissal in the residue; a re-read
//                  does not reopen it, nor a reload
//   DP-2 AWAY      the hero died while the browser was closed: the first load opens the
//                  popup with the server's cost; Hunt summary closes it, opens the hunt
//                  summary and stores the dismissal
//   DP-3 OLDER ROW a death row from before the server half (no `saved`, no `session`) still
//                  opens the popup with its cost and says nothing about a Blessing
//   DP-4 RELOAD IN TOWN  an ordinary end opens its summary; closed, the hunt bar leaves town. A reload
//                  brings neither back and the Town / Home strip stands (the panel 2026-11-01, twice:
//                  "Last hunt: Wickstead | Summary" in its place until Summary was pressed)
//   DP-5 BAR IN TOWN  a hunt bar left standing in town (a death's summary opens by no one) keeps the Town / Home
//                  row, clear of the bar; a running hunt hides the row (Andy 2026-11-01: no way out of the house)
//   DP-6 HERO SWITCH  the summary closed, or still up, when the viewed hero changes: on the way back the "Last hunt"
//                  bar stays out of town and the summary stays shut (a switch remounts the shell)
//   DP-8 OK STAYS ON SCREEN  at 667x375 with the longest why line the card scrolls, its answers do not (risk ruling, 2026-11-04 UTC).
//   DP-7 AN END ALREADY SEEN IS OVER  (party panel 2026-11-03) "Pip left the hunt, so Kell came home too" stands over the hero on screen with
//                  that hunt's summary, and goes when the summary is closed, with no new answer from the server
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/party-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const imp = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { MONSTERS } = await imp('src/data/monsters.js');
const { HUNT_INDEX } = await imp('src/data/hunts.js');
const { SKILLS_DEF } = await imp('src/data/skills.js');

const SESSION = FIXTURE.characters[0].hunt.session_id;
const SEEN = 'died:' + SESSION;
/* One death row as hr_death_log_view projects it. */
const ROW = { id: 777, at: '2026-10-17T12:29:58Z', hunt: 'millrace_sewer', session: SESSION, monster: 'rat_king', xp: 1240,
  xp_lost: { melee: 40, level: 1200 }, saved: { level: 300 } };
const WANT = {
  title: 'Tyler died in ' + HUNT_INDEX.millrace_sewer.name,
  killed: 'Killed by ' + MONSTERS.rat_king.name + '.',
  lost: 'Dying cost 1,200 Level XP and 40 ' + SKILLS_DEF.melee.name + ' XP.',
  saved: 'Your Blessing kept 300 Level XP, and is now used up.',
  town: 'Tyler is back in town with full health and mana.',
};

/* ── DP-0: the words, in node ── */
async function pure(base) {
  const fails = [];
  const { deathWords } = await import(pathToFileURL(join(base, 'src/shell/death-popup.js')).href);
  const { deathLogOf } = await import(pathToFileURL(join(base, 'src/session/character-sections.js')).href);
  const csOf = (rows) => ({ read: (k) => (k === 'name' ? 'Tyler' : k === 'death_log' ? rows : null), record: { residue: {} } });
  const words = (r) => { const cs = csOf([r]); return deathWords(cs, { session: SESSION, row: deathLogOf(cs)[0] }); };
  const w = words(ROW);
  for (const k of Object.keys(WANT)) if (w[k] !== WANT[k]) fail(fails, 'DP-0 ' + k + ' reads ' + JSON.stringify(w[k]) + ', want ' + JSON.stringify(WANT[k]));
  const old = Object.assign({}, ROW); delete old.saved;
  if (words(old).saved !== '') fail(fails, 'DP-0 a row with no `saved` key (an older server) still says something about a Blessing: ' + JSON.stringify(words(old).saved));
  if (!/^No Blessing was active\./.test(words(Object.assign({}, ROW, { saved: null })).saved)) fail(fails, 'DP-0 saved null does not say no Blessing was active');
  const unpriced = words(Object.assign({}, ROW, { xp: null, xp_lost: null }));
  if (unpriced.lost !== '') fail(fails, 'DP-0 an unpriced death states a cost: ' + JSON.stringify(unpriced.lost));
  /* THE WHY (Tyler 2026-11-04 UTC: a death teaches): how far under the ground, what that did to every blow, what would have helped. The server's Level and row; an older hunt's row says nothing. */
  const { charXpForLevel } = await import(pathToFileURL(join(base, 'src/core/xp.js')).href);
  const whyAt = (level, session) => { const hunt = { session_id: session, hunt_id: ROW.hunt, ended: true, session: { end_reason: 'died' } };
    const cs = { read: (k) => (k === 'name' ? 'Tyler' : k === 'death_log' ? [ROW] : k === 'state' ? { level_xp: charXpForLevel(level) } : k === 'hunt' ? hunt : null), record: { residue: {} } };
    return deathWords(cs, { session: SESSION, row: deathLogOf(cs)[0] }).why; };
  const under = whyAt(2, SESSION), floor = HUNT_INDEX[ROW.hunt].band[0];
  if (under !== 'You were ' + (floor - 2) + ' Levels under this ground, so its monsters hit you ' + (floor - 2) * 20 + '% harder. Better armor, food eaten sooner, a healer or a few more Levels would help.') fail(fails, 'DP-0 a death under the floor reads ' + JSON.stringify(under));
  if (whyAt(floor, SESSION) !== 'Better armor, food eaten sooner or a smaller pull would help.') fail(fails, 'DP-0 a death in range reads ' + JSON.stringify(whyAt(floor, SESSION)));
  if (whyAt(2, 'an-older-hunt') !== '') fail(fails, 'DP-0 an older hunt\'s death guesses at its Level: ' + JSON.stringify(whyAt(2, 'an-older-hunt')));
  return fails;
}
function fail(list, msg) { list.push(msg); }

function dead(env, row) {
  env.hunt.ended = true;
  env.hunt.session = Object.assign({}, env.hunt.session, { end_reason: 'died', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
  env.death_log = [clone(row || ROW)];
  env.state = Object.assign({}, env.state, { level_xp: 0 });
}
function scripted(died, row) {
  const s = { env: clone(FIXTURE.characters), version: 1, calls: [], residue: { 0: {}, 1: {} } };
  if (died) dead(s.env[0], row);
  s.next = (slot) => Object.assign(clone(s.env[slot]), { version: ++s.version, client_state: clone(s.residue[slot] || {}) });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load') return json(s.env[body.p_slot] ? s.next(body.p_slot) : { ok: false, error: 'no_character' });
    if (name === 'hr-accrue') return json(Object.assign({ accrued: true }, s.next(body.slot)));
    if (name === 'hr_put_client_state') { Object.assign(s.residue[body.p_slot], body.p_patch || {}); return json({ ok: true }); }
    return json({ ok: true });
  });
}

const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
async function open(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  return play(page);
}
async function play(page) {
  await wait(page, () => document.querySelector('.hs-launchers') || document.querySelector('[data-app="play"][data-slot="0"]'));
  if (!(await page.$('.hs-launchers'))) await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('#panel-world[data-slot="0"]') && document.querySelector('.hs-launchers'));
}
/* A new full envelope, the way the live game gets one: a pushed frame carrying the whole character at the next
   version (2026-12-25-frame-push-revive.sql), applied like a load. */
async function pushEnvelope(page, s, slot) {
  const e = s.next(slot);
  await page.evaluate(([t, env]) => window.__hub.send(t, { t: 'state', frame: env.version, env }), ['hr:' + UID + ':' + slot, e]);
  await page.waitForTimeout(300);
}
const POP = '[data-hs-win="death"]:not(.is-leaving)';
const popOpen = (page) => page.evaluate((q) => !!document.querySelector(q + ' .hdeath-card'), POP);
const popWaits = (page) => wait(page, (q) => !!document.querySelector(q + ' .hdeath-card'), POP, 4000);
const popRead = (page) => page.evaluate((q) => {
  const w = document.querySelector(q);
  const t = (sel) => { const n = w.querySelector(sel); return n && getComputedStyle(n).display !== 'none' ? n.textContent : ''; };
  const r = w.getBoundingClientRect();
  return { modal: w.classList.contains('is-modal'), cx: r.left + r.width / 2, cy: r.top + r.height / 2, vw: innerWidth, vh: innerHeight,
    inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    title: t('.hdeath-title'), killed: t('.hdeath-killed'), why: t('.hdeath-why'), lost: t('.hdeath-lost'), saved: t('.hdeath-saved'), town: t('.hdeath-town'),
    summary: !!document.querySelector('[data-hs-win="hunt-summary"]:not(.is-leaving)'),
    minPx: Math.min(...Array.from(w.querySelectorAll('.hdeath-card *')).filter((n) => n.childNodes.length && n.textContent.trim() && getComputedStyle(n).display !== 'none').map((n) => parseFloat(getComputedStyle(n).fontSize))) };
}, POP);
const seenOf = (s) => ((s.residue[0].alerts || {}).seen || []);
const words = (r, fails, tag, rule) => { for (const k of Object.keys(WANT)) if (r[k] !== WANT[k]) fails.push(rule + ' [' + tag + '] ' + k + ' reads ' + JSON.stringify(r[k]) + ', want ' + JSON.stringify(WANT[k])); };

async function pageRules(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await leaseBrowser(chromium);
  try {
    for (const vp of [{ width: 1440, height: 900 }, { width: 922, height: 423 }]) {
      const tag = vp.width + 'x' + vp.height;
      const errors = [];
      const fresh = async (s) => {
        const ctx = await browser.newContext({ viewport: vp });
        const page = await ctx.newPage();
        page.setDefaultTimeout(6000);
        page.setDefaultNavigationTimeout(30000);   // a page load is the machine's, not a rule (window-camera's note: a cold module graph took 12 s on a slow disk)
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
        await stub(page, s);
        return { ctx, page, ok: await open(page, base) };
      };
      try {
        /* DP-1 ATTENDED */
        const s = scripted(false);
        const a = await fresh(s);
        if (!a.ok) { fails.push('DP-1 [' + tag + '] the character did not open: ' + errors.slice(0, 2).join(' | ')); await a.ctx.close(); continue; }
        await a.page.waitForTimeout(500);
        if (await popOpen(a.page)) fails.push('DP-1 [' + tag + '] a death popup opened with no death');
        dead(s.env[0]);
        await pushEnvelope(a.page, s, 0);
        if (!(await popWaits(a.page))) fails.push('DP-1 [' + tag + '] the death did not open the popup');
        else {
          await a.page.waitForTimeout(400);
          const r = await popRead(a.page);
          if (!r.modal || Math.abs(r.cx - r.vw / 2) > 40 || !r.inside) fails.push('DP-1 [' + tag + '] the popup is not a centred modal on screen: ' + JSON.stringify({ modal: r.modal, cx: r.cx, vw: r.vw, inside: r.inside }));
          words(r, fails, tag, 'DP-1');
          if (!(r.minPx >= 12)) fails.push('DP-1 [' + tag + '] popup text at ' + r.minPx + ' px (under 12)');
          if (!/would help\.$/.test(r.why || '')) fails.push('DP-1 [' + tag + '] the card never says what would have helped: ' + JSON.stringify(r.why));
          if (r.summary) fails.push('DP-1 [' + tag + '] the hunt summary opened over the death popup');
          const side = await a.page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-widget="alerts"] li')).map((li) => li.textContent).filter((t) => /died/.test(t)));
          if (side.length) fails.push('DP-1 [' + tag + '] the death also raised a side line: ' + side.join(' | '));
          if (shots) await a.page.screenshot({ path: join(shots, 'death-popup-' + tag + '.png') });
          /* DP-8 OK STAYS ON SCREEN: the smallest phone the game plays on, the longest why line (the card scrolls; its answers do not). */
          if (vp.height < 500) {
            await a.page.setViewportSize({ width: 667, height: 375 });
            await a.page.evaluate((q) => { const put = (sel, t) => { const n = document.querySelector(q + ' ' + sel); n.textContent = t; n.classList.add('is-on'); }; put('.hdeath-why', 'You were 31 Levels under this ground, so its monsters hit you 620% harder. Better armor, food eaten sooner, a healer or a few more Levels would help.'); put('.hdeath-saved', "No Blessing was active. Blessings, in the Shop's Services tab, lower what dying costs, and they're free until Level 30."); }, POP);
            await a.page.waitForTimeout(200);
            const hit = await a.page.evaluate((q) => { const b = document.querySelector(q + ' [data-hs-act="death-ok"]').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return { bottom: b.bottom, edge: document.querySelector(q + ' .hs-win-body').getBoundingClientRect().bottom, ok: !!e && !!e.closest('[data-hs-act="death-ok"]') }; }, POP);
            if (!hit.ok || hit.bottom > hit.edge + 0.5) fails.push('DP-8 [667x375] OK runs past the card on a long card: ' + JSON.stringify(hit));
            await a.page.setViewportSize(vp);
          }
          /* A reload before OK: the popup comes back, with the same server cost. */
          await a.page.reload({ waitUntil: 'load' });
          if (!(await play(a.page)) || !(await popWaits(a.page))) fails.push('DP-1 [' + tag + '] a reload before OK lost the death popup');
          else {
            await a.page.waitForTimeout(300);
            words(await popRead(a.page), fails, tag, 'DP-1 (reload)');
            await a.page.click(POP + ' [data-hs-act="death-ok"]');
            if (!(await wait(a.page, () => !document.querySelector('[data-hs-win="death"]'), null, 3000))) fails.push('DP-1 [' + tag + '] OK did not close the popup');
            await a.page.waitForTimeout(600);   // the residue put (sent at once on a dismissal)
            if (!seenOf(s).includes(SEEN)) fails.push('DP-1 [' + tag + '] the dismissal was not stored: ' + JSON.stringify(seenOf(s)));
            await pushEnvelope(a.page, s, 0);
            await a.page.waitForTimeout(400);
            if (await popOpen(a.page)) fails.push('DP-1 [' + tag + '] a re-read reopened a dismissed death');
            await a.page.reload({ waitUntil: 'load' });
            await play(a.page);
            await a.page.waitForTimeout(1200);
            if (await popOpen(a.page)) fails.push('DP-1 [' + tag + '] a reload showed a dismissed death again');
          }
        }
        await a.ctx.close();
        /* DP-2 AWAY */
        const s2 = scripted(true);
        const c = await fresh(s2);
        if (!c.ok) fails.push('DP-2 [' + tag + '] the character did not open');
        else if (!(await popWaits(c.page))) fails.push('DP-2 [' + tag + '] a death while away opened no popup on load');
        else {
          await c.page.waitForTimeout(300);
          words(await popRead(c.page), fails, tag, 'DP-2');
          await c.page.click(POP + ' [data-hs-act="death-summary"]');
          if (!(await wait(c.page, () => !document.querySelector('[data-hs-win="death"]') && document.querySelector('[data-hs-win="hunt-summary"]'), null, 3000))) {
            fails.push('DP-2 [' + tag + '] Hunt summary did not close the popup and open the hunt summary');
          }
          await c.page.waitForTimeout(800);
          if (!seenOf(s2).includes(SEEN)) fails.push('DP-2 [' + tag + '] Hunt summary did not store the dismissal');
        }
        await c.ctx.close();
        /* DP-3 AN OLDER SERVER: a death row with no `saved` key (before 2026-11-07-death-popup-blessing.sql) says
           nothing about a Blessing; every other line is still the row's. */
        const older = clone(ROW); delete older.saved; delete older.session;
        const d = await fresh(scripted(true, older));
        if (!d.ok || !(await popWaits(d.page))) fails.push('DP-3 [' + tag + '] an older server\'s death row opened no popup');
        else {
          await d.page.waitForTimeout(300);
          const r = await popRead(d.page);
          if (r.saved !== '') fails.push('DP-3 [' + tag + '] a row with no Blessing key reads ' + JSON.stringify(r.saved));
          if (r.lost !== WANT.lost || r.killed !== WANT.killed) fails.push('DP-3 [' + tag + '] an older row reads ' + JSON.stringify([r.killed, r.lost]));
        }
        await d.ctx.close();
        /* DP-4 A RELOAD IN TOWN LEAVES THE TOWN CLEAR */
        const s4 = scripted(false);
        s4.env[0].state = Object.assign({}, s4.env[0].state, { active_kind: 'idle', active_id: null });
        s4.env[0].hunt.ended = true;
        s4.env[0].hunt.session = Object.assign({}, s4.env[0].hunt.session, { end_reason: 'stamina', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
        const e = await fresh(s4);
        const SUM = '[data-hs-win="hunt-summary"]:not(.is-leaving)';
        const townView = (page) => page.evaluate((q) => {
          const seen = (n) => !!n && n.getClientRects().length > 0;
          return { bar: seen(document.querySelector('.ht-bar')), summary: !!document.querySelector(q), home: seen(document.querySelector('[data-world-choice="home"]')) };
        }, SUM);
        if (!e.ok || !(await wait(e.page, (q) => !!document.querySelector(q), SUM, 4000))) fails.push('DP-4 [' + tag + '] an ended hunt opened no summary on its first load');
        else {
          await e.page.click('[data-hs-close="hunt-summary"]');
          await wait(e.page, (q) => !document.querySelector(q), SUM, 3000);
          await e.page.waitForTimeout(800);   // the close's residue put, sent at once: under the 1.5 s debounce on purpose (v0.2.79)
          const closed = await townView(e.page);
          if (closed.bar || !closed.home) fails.push('DP-4 [' + tag + '] closing the summary left ' + JSON.stringify(closed));
          await e.page.reload({ waitUntil: 'load' });
          await play(e.page);
          await e.page.waitForTimeout(1200);
          const back = await townView(e.page);
          if (back.bar || back.summary || !back.home) fails.push('DP-4 [' + tag + '] a reload in town reads ' + JSON.stringify(back));
        }
        await e.ctx.close();
        /* DP-5 A HUNT BAR LEFT STANDING IN TOWN KEEPS THE TOWN / HOME ROW (Andy 2026-11-01: "the button's not there to go back").
           A death's summary never opens by itself, so its bar stands in town ("Last hunt: ... Summary") until Summary is pressed and
           closed; the row of Town / Home buttons shares its way out with the house and must stand under it. A running hunt hides the row. */
        const rowView = (page) => page.evaluate(() => {
          const box = (n) => { const r = n && n.getClientRects().length ? n.getBoundingClientRect() : null; return r ? { top: r.top, bottom: r.bottom } : null; };
          return { bar: box(document.querySelector('.ht-bar')), chrome: box(document.querySelector('#panel-world .world-chrome')),
            town: box(document.querySelector('[data-world-choice="town"]')), home: box(document.querySelector('[data-world-choice="home"]')) };
        });
        const s5 = scripted(true);
        s5.env[0].state = Object.assign({}, s5.env[0].state, { active_kind: 'idle', active_id: null });
        const g = await fresh(s5);
        if (!g.ok || !(await popWaits(g.page))) fails.push('DP-5 [' + tag + '] a death in town opened no popup');
        else {
          await g.page.click(POP + ' [data-hs-act="death-ok"]');
          await wait(g.page, () => !document.querySelector('[data-hs-win="death"]'), null, 3000);
          await g.page.waitForTimeout(600);
          const left = await rowView(g.page);
          if (!left.bar) fails.push('DP-5 [' + tag + '] the scenario did not leave the hunt bar standing in town: ' + JSON.stringify(left));
          else if (!left.town || !left.home) fails.push('DP-5 [' + tag + '] the hunt bar standing in town took the Town / Home buttons: ' + JSON.stringify(left));
          else if (left.bar.top < left.chrome.bottom - 1) fails.push('DP-5 [' + tag + '] the hunt bar overlaps the Town / Home row: ' + JSON.stringify(left));
        }
        await g.ctx.close();
        const live = await fresh(scripted(false));
        await live.page.waitForTimeout(1200);
        const running = await rowView(live.page);
        if (!live.ok || !running.bar) fails.push('DP-5 [' + tag + '] a running hunt showed no hunt bar: ' + JSON.stringify(running));
        else if (running.chrome || running.town || running.home) fails.push('DP-5 [' + tag + '] a running hunt still shows the Town / Home row: ' + JSON.stringify(running));
        await live.ctx.close();
        /* DP-6 A HERO SWITCH DOESN'T BRING THE "LAST HUNT" BAR BACK (v0.2.82, played): a switch of the viewed hero remounts the shell, and "the summary was closed"
           went with the old one. Closed then switched, or switched away with the summary up: on the way back the town stays clear, and the summary stays shut. */
        const endedHere = () => {
          const s6 = scripted(false);
          s6.env[0].state = Object.assign({}, s6.env[0].state, { active_kind: 'idle', active_id: null });
          s6.env[0].hunt.ended = true;
          s6.env[0].hunt.session = Object.assign({}, s6.env[0].hunt.session, { end_reason: 'stamina', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
          return s6;
        };
        const showHero = async (page, slot) => {
          await wait(page, (k) => document.querySelector('.char-tab[data-slot="' + k + '"]'), slot);
          await page.evaluate((k) => document.querySelector('.char-tab[data-slot="' + k + '"]').click(), slot);
          return wait(page, (k) => document.querySelector('#panel-world[data-slot="' + k + '"]') && document.querySelector('.hs-launchers'), slot);
        };
        for (const closeIt of [true, false]) {
          const say = closeIt ? 'closed, then a switch' : 'a switch with the summary up';
          const w = await fresh(endedHere());
          if (!w.ok || !(await wait(w.page, (q) => !!document.querySelector(q), SUM, 4000))) fails.push('DP-6 [' + tag + '] [' + say + '] the ended hunt opened no summary');
          else {
            if (closeIt) {
              await w.page.click('[data-hs-close="hunt-summary"]');
              await wait(w.page, (q) => !document.querySelector(q), SUM, 3000);
              await w.page.waitForTimeout(300);
            }
            const before = await townView(w.page);
            if (closeIt && (before.bar || !before.home)) fails.push('DP-6 [' + tag + '] [' + say + '] closing it left ' + JSON.stringify(before));
            if (!(await showHero(w.page, 1))) fails.push('DP-6 [' + tag + '] [' + say + '] the other hero did not show');
            else if (!(await showHero(w.page, 0))) fails.push('DP-6 [' + tag + '] [' + say + '] the hero did not show again');
            else {
              await w.page.waitForTimeout(600);
              const back = await townView(w.page);
              if (back.bar || back.summary || !back.home) fails.push('DP-6 [' + tag + '] [' + say + '] back on the hero the town reads ' + JSON.stringify(back));
            }
          }
          await w.ctx.close();
        }
        /* DP-7 */
        if (vp.width > 1000) {
          const s7 = endedHere();
          Object.assign(s7.env[0].hunt.session, { end_reason: 'party_member_left', end_by: 'Bramwell', end_by_why: 'left' });
          const z = await fresh(s7);
          const homeLine = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.hw-alert-text')).filter((n) => /came home too/.test(n.textContent)).length);
          if (!z.ok || !(await wait(z.page, (q) => !!document.querySelector(q), SUM, 4000))) fails.push('DP-7 [' + tag + '] the ended hunt opened no summary');
          else {
            await wait(z.page, () => Array.from(document.querySelectorAll('.hw-alert-text')).some((n) => /came home too/.test(n.textContent)), null, 4000);
            if ((await homeLine(z.page)) !== 1) fails.push('DP-7 [' + tag + '] CONTROL: no came-home line stands with the summary');
            const reads = s7.calls.length;
            await z.page.click('[data-hs-close="hunt-summary"]');
            await wait(z.page, (q) => !document.querySelector(q), SUM, 3000);
            await z.page.waitForTimeout(700);
            if ((await homeLine(z.page)) !== 0) fails.push('DP-7 [' + tag + '] the came-home line outlived its summary (' + (s7.calls.length - reads) + ' calls since the close)');
          }
          await z.ctx.close();
        }
        if (errors.length) fails.push('DP [' + tag + '] console errors: ' + errors.slice(0, 3).join(' | '));
      } catch (e) {
        fails.push('DP [' + tag + '] threw: ' + String(e && e.message).split('\n')[0]);
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const PAGE_MUTANTS = [
  ['OK scrolls off a phone on a long card', 'src/styles/summary.css', 'position: sticky; bottom: -10px; z-index: 1; ', ''],
  ['a death teaches nothing: the card has no why', 'src/shell/death-popup.js', '    why: whyWords(cs, d),', "    why: '',"],
  ['a death opens no popup', 'src/shell/death-popup.js', "    ctx.wm.open('death');", '    void 0;'],
  ['the dismissal is not kept', 'src/shell/death-popup.js', '{ const s = showing; showing = null; dismissDeath(cs, s); }', '{ showing = null; }'],
  ['the cost is not the row\'s', 'src/shell/death-popup.js', "'Dying cost ' + xpWords(row.xpLost)", "'Dying cost ' + xpWords({ level: row.xp })"],
  ['the Blessing line ignores the row', 'src/shell/death-popup.js', ": Object.keys(row.saved).length ? 'Your Blessing kept '", ": false ? 'Your Blessing kept '"],
  ['an older row is read as no Blessing', 'src/shell/death-popup.js', "    saved: row.saved === undefined ? ''\n", "    saved: row.saved === undefined ? 'No Blessing was active.'\n"],
  ['the own death is a side line again', 'src/shell/alerts.js', '    if (!viewed && !deathSeen(cs, h.sessionId)) out.push(', '    out.push('],
  ['the projection drops the Blessing', 'src/session/character-sections.js', "      saved: !('saved' in r) ? undefined : isObj(r.saved) ? xpMap(r.saved) : null });", '      saved: undefined });'],
  ['Hunt summary only closes', 'src/shell/windows/death.js', "  if (action === 'death-summary') ctx.show('hunt-summary');\n", ''],
  ['a reload stands the hunt bar back up in town', 'src/hunt-view/summary-recorder.js', 'return a.earlier === sessionId || a.closed === sessionId;', 'return a.closed === sessionId;'],
  ['a seen end stays in the lines (DP-7)', 'src/shell/alerts.js', 'if (stale || seenEnd || ', 'if (stale || '],
  ['closing a summary judges no line (DP-7)', 'src/shell/shell.js', 'if (ctx.alerts) ctx.alerts.rescan(ctx.character);', ''],
  ['a hero switch stands the hunt bar back up in town (DP-6)', 'src/hunt-view/summary-recorder.js', 'attach(cs).closed = h.sessionId;', 'void attach(cs);'],
  ['a hero switch with the summary up stands the hunt bar in its place (DP-6)', 'src/shell/shell.js', "if (wm.isOpen('hunt-summary')) summaryClosedBy(ctx.character);", 'void 0;'],
  ['a closed summary waits out the residue debounce', 'src/hunt-view/summary-recorder.js', "if (typeof cs.flushResidue === 'function') cs.flushResidue().catch(() => {});", 'void 0;'],
  ['the hunt bar alone hides the Town / Home row', 'src/styles/app.css', '.app.is-game #panel-world[data-scene="hunt"]:has(.ht-bar) .world-chrome', '.app.is-game:has(.ht-bar) #panel-world .world-chrome'],
  ['the pane never names its scene', 'src/world/world-boot.js', "    panel.setAttribute('data-scene', sc.kind);", '    void 0;'],
  ['the summary opens over the popup', 'src/shell/shell.js', "if (cs && takeFresh(cs) && !deathPopupOf(cs) && !wm.isOpen('death'))", 'if (cs && takeFresh(cs))'],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'death-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = [...await pure(ROOT), ...await pageRules(null, shots)];
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'death-popup: ' + fails.length + ' rule(s) RED' : 'death-popup: opens once per death with the server\'s cost, viewed, after a reload and away; dismissal kept' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = [...await pure(ROOT), ...await pageRules(null, null)];
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
  const chosen = PAGE_MUTANTS.filter((m) => !only || m[0].includes(only));
  for (const [name, file, from, to] of chosen) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found once in ' + file); bad++; continue; }
    const fails = await pageRules({ [file]: text.replace(from, to) }, null);
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'death-popup --mutate: ' + bad + ' escaped' : 'death-popup --mutate: ' + chosen.length + '/' + chosen.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
