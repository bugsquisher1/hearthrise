#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/death-popup.mjs — THE DEATH POPUP (Tyler 2026-10-19 build card), IN A REAL CHROMIUM.
//
//   node tests/death-popup.mjs                the rules
//   node tests/death-popup.mjs --mutate       every planted defect must turn a rule RED
//   node tests/death-popup.mjs --shots <dir>  also write the visual-gate screenshots (1440x900, 922x423)
//
// mutant-anchors: src/shell/death-popup.js src/shell/windows/death.js src/shell/alerts.js src/session/character-sections.js
// mutant-writes-tree: no — page mutants are served overrides
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs), on
// tests/fixtures/party-envelope.json's slot 0 (hunting in The Sewer). The death row is the
// shape hr_death_log_view projects (2026-10-31-death-popup.sql; the server half and the
// engine's account are proven by that file's §4 and tests/hunt-sessions-settle.mjs BOTH-PATH).
//   DP-1 ATTENDED  the hunt section ends `died` in a new envelope: the death popup opens,
//                  centred, and every line is the death row's (where, killer and blow, the
//                  last seconds oldest first, XP lost, Blessing saved, back in town); no side
//                  alert line for the death; OK closes it and stores the death id in the
//                  residue; a re-read does not reopen it
//   DP-2 RELOAD    the same server after the dismissal: a reload shows no popup
//   DP-3 AWAY      the hero died while the browser was closed: the first load opens the
//                  popup; Hunt summary closes it and opens the hunt summary
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { launchOptions } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, UID, serve, SDK_STUB } from './_client-harness.mjs';

const FIXTURE = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/party-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const { MONSTERS } = await import(pathToFileURL(join(ROOT, 'src/data/monsters.js')).href);
const { HUNT_INDEX } = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href);
const { SKILLS_DEF } = await import(pathToFileURL(join(ROOT, 'src/data/skills.js')).href);

const SESSION = FIXTURE.characters[0].hunt.session_id;
/* One death row as hr_death_log_view projects it. */
const ROW = { id: 777, at: '2026-10-17T12:29:58Z', hunt: 'millrace_sewer', session: SESSION, monster: 'hive_wasp', xp: 1240,
  xp_lost: { level: 1200, melee: 40 }, saved: { level: 300 },
  blow: { m: 'hive_wasp', ab: 'wasp_sting', n: 34 },
  recent: [{ k: 'dmg', n: 34, ago: 0, m: 'hive_wasp', ab: 'wasp_sting' }, { k: 'heal', n: 20, ago: 1500 }, { k: 'dmg', n: 27, ago: 2600, m: 'rat' }] };
const spelled = (id) => { const t = String(id).replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
const WANT = {
  title: 'You died in ' + HUNT_INDEX.millrace_sewer.name,
  killed: 'Killed by ' + MONSTERS.hive_wasp.name + ' — ' + spelled('wasp_sting') + ', 34 damage',
  recent: [MONSTERS.rat.name + ' hit you for 27|2.6 s before', 'You healed 20|1.5 s before', MONSTERS.hive_wasp.name + ' hit you for 34 (' + spelled('wasp_sting') + ')|at the end'],
  lost: 'You lost 1,200 Level XP and 40 ' + SKILLS_DEF.melee.name + ' XP.',
  saved: 'Your Blessing saved 300 Level XP.',
  town: 'You are back in town with full health and mana.',
};

function dead(env) {
  env.hunt.ended = true;
  env.hunt.session = Object.assign({}, env.hunt.session, { end_reason: 'died', ended_at: '2026-10-17T12:30:00Z', phase: 'ended' });
  env.death_log = [clone(ROW)];
}
function scripted(died) {
  const s = { env: clone(FIXTURE.characters), version: 1, calls: [], residue: { 0: {}, 1: {} } };
  if (died) dead(s.env[0]);
  s.next = (slot) => Object.assign(clone(s.env[slot]), { version: ++s.version, client_state: clone(s.residue[slot] || {}) });
  return s;
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('/').pop();
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
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('#panel-world[data-slot="0"]') && document.querySelector('.hs-launchers'));
}
async function pushEnvelope(page, s, slot) {
  const frame = s.version + 2;
  s.version = frame;
  const before = s.calls.filter((c) => c.name === 'hr-accrue').length;
  await page.evaluate(([t, f, st]) => window.__hub.send(t, { t: 'delta', frame: f, patch: { state: st } }), ['hr:' + UID + ':' + slot, frame, s.env[slot].state]);
  for (let i = 0; i < 60 && s.calls.filter((c) => c.name === 'hr-accrue').length <= before; i++) await page.waitForTimeout(50);
  await page.waitForTimeout(300);
}
const POP = '[data-hs-win="death"]:not(.is-leaving)';
const popOpen = (page) => page.evaluate((q) => !!document.querySelector(q + ' .hdeath-card'), POP);
const popRead = (page) => page.evaluate((q) => {
  const w = document.querySelector(q);
  const t = (sel) => { const n = w.querySelector(sel); return n ? n.textContent : null; };
  const r = w.getBoundingClientRect();
  return { modal: w.classList.contains('is-modal'), cx: r.left + r.width / 2, cy: r.top + r.height / 2, vw: innerWidth, vh: innerHeight,
    title: t('.hdeath-title'), killed: t('.hdeath-killed'), lost: t('.hdeath-lost'), saved: t('.hdeath-saved'), town: t('.hdeath-town'),
    recent: Array.from(w.querySelectorAll('.hdeath-recent li')).map((li) => li.querySelector('.hdeath-what').textContent + '|' + li.querySelector('.hdeath-when').textContent),
    minPx: Math.min(...Array.from(w.querySelectorAll('.hdeath-card *')).filter((n) => n.childNodes.length && n.textContent.trim()).map((n) => parseFloat(getComputedStyle(n).fontSize))) };
}, POP);
const seenOf = (s) => ((s.residue[0].alerts || {}).seen || []);

async function pageRules(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const base = 'http://127.0.0.1:' + port;
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    for (const vp of shots ? [{ width: 1440, height: 900 }, { width: 922, height: 423 }] : [{ width: 1440, height: 900 }]) {
      const tag = vp.width + 'x' + vp.height;
      const errors = [];
      const fresh = async (s) => {
        const ctx = await browser.newContext({ viewport: vp });
        const page = await ctx.newPage();
        page.setDefaultTimeout(6000);
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
        if (!(await wait(a.page, (q) => !!document.querySelector(q + ' .hdeath-card'), POP, 4000))) fails.push('DP-1 [' + tag + '] the death did not open the popup' + JSON.stringify(await a.page.evaluate(() => [Array.from(document.querySelectorAll('[data-hs-win]')).map((w) => w.getAttribute('data-hs-win') + ':' + w.className), document.body.className, document.querySelector('#panel-world') && document.querySelector('#panel-world').className])));
        else {
          await a.page.waitForTimeout(400);
          const r = await popRead(a.page);
          if (!r.modal || Math.abs(r.cx - r.vw / 2) > 40) fails.push('DP-1 [' + tag + '] the popup is not a centred modal: ' + JSON.stringify({ modal: r.modal, cx: r.cx, vw: r.vw }));
          for (const k of ['title', 'killed', 'lost', 'saved', 'town']) if (r[k] !== WANT[k]) fails.push('DP-1 [' + tag + '] ' + k + ' reads ' + JSON.stringify(r[k]) + ', want ' + JSON.stringify(WANT[k]));
          if (JSON.stringify(r.recent) !== JSON.stringify(WANT.recent)) fails.push('DP-1 [' + tag + '] the last seconds read ' + JSON.stringify(r.recent));
          if (!(r.minPx >= 12)) fails.push('DP-1 [' + tag + '] popup text at ' + r.minPx + ' px (under 12)');
          const side = await a.page.evaluate(() => Array.from(document.querySelectorAll('.hw-alert')).map((li) => li.getAttribute('data-kind')).filter((k) => k === 'death' || k === 'ended'));
          if (side.length) fails.push('DP-1 [' + tag + '] the death also raised side line(s): ' + side.join(','));
          if (shots) await a.page.screenshot({ path: join(shots, 'death-popup-' + tag + '.png') });
          await a.page.click(POP + ' [data-hs-act="death-ok"]');
          if (!(await wait(a.page, () => !document.querySelector('[data-hs-win="death"]'), null, 3000))) fails.push('DP-1 [' + tag + '] OK did not close the popup');
          await a.page.waitForTimeout(600);   // the residue put (sent at once on a dismissal)
          if (!seenOf(s).includes('died:777')) fails.push('DP-1 [' + tag + '] the dismissal was not stored: ' + JSON.stringify(seenOf(s)));
          await pushEnvelope(a.page, s, 0);
          await a.page.waitForTimeout(400);
          if (await popOpen(a.page)) fails.push('DP-1 [' + tag + '] a re-read reopened a dismissed death');
        }
        await a.ctx.close();
        /* DP-2 RELOAD */
        const b = await fresh(s);
        await b.page.waitForTimeout(1200);
        if (!b.ok) fails.push('DP-2 [' + tag + '] the reload did not open the character');
        else if (await popOpen(b.page)) fails.push('DP-2 [' + tag + '] a reload showed a dismissed death again');
        await b.ctx.close();
        /* DP-3 AWAY */
        const s3 = scripted(true);
        const c = await fresh(s3);
        if (!c.ok) fails.push('DP-3 [' + tag + '] the character did not open');
        else if (!(await wait(c.page, (q) => !!document.querySelector(q + ' .hdeath-card'), POP, 4000))) fails.push('DP-3 [' + tag + '] a death while away opened no popup on load');
        else {
          const r = await popRead(c.page);
          if (r.killed !== WANT.killed) fails.push('DP-3 [' + tag + '] the away popup reads ' + JSON.stringify(r.killed));
          await c.page.click(POP + ' [data-hs-act="death-summary"]');
          if (!(await wait(c.page, () => !document.querySelector('[data-hs-win="death"]') && document.querySelector('[data-hs-win="hunt-summary"]'), null, 3000))) {
            fails.push('DP-3 [' + tag + '] Hunt summary did not close the popup and open the hunt summary');
          }
          await c.page.waitForTimeout(1200);
          if (!seenOf(s3).includes('died:777')) fails.push('DP-3 [' + tag + '] Hunt summary did not store the dismissal');
        }
        await c.ctx.close();
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
  ['a death opens no popup', 'src/shell/death-popup.js', "    ctx.wm.open('death');", '    void 0;'],
  ['the dismissal is not kept', 'src/shell/death-popup.js', '    if (showing !== null && !ctx.wm.isOpen(\'death\')) { const id = showing; showing = null; dismissDeath(cs, id); }', "    if (showing !== null && !ctx.wm.isOpen('death')) { showing = null; }"],
  ['the blow is not the server’s', 'src/shell/death-popup.js', "whole(d.blow.amount) + ' damage'", "whole(d.xp) + ' damage'"],
  ['the Blessing line ignores the row', 'src/shell/death-popup.js', "    saved: d.saved === null ? '' : Object.keys(d.saved).length ?", "    saved: d.saved === null ? '' : false ?"],
  ['the last seconds read newest first', 'src/shell/death-popup.js', '    recent: d.recent.slice().reverse().map(', '    recent: d.recent.slice().map('],
  ['the own death is a side line again', 'src/shell/alerts.js', "  if (h.ended && h.endReason === 'died') return out;\n", ''],
  ['the projection drops the blow', 'src/session/character-sections.js', "      blow: isObj(r.blow) && nat(r.blow.n) !== null ?", '      blow: false ?'],
  ['Hunt summary only closes', 'src/shell/windows/death.js', "  if (action === 'death-summary') ctx.show('hunt-summary');\n", ''],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'death-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await pageRules(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'death-popup: ' + fails.length + ' rule(s) RED' : 'death-popup: opens once per death from the server row, attended and away; dismissal kept' + (shots ? ' (shots in ' + shots + ')' : ''));
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await pageRules(null, null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of PAGE_MUTANTS) {
    const text = await readFile(join(ROOT, file), 'utf8');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found once in ' + file); bad++; continue; }
    const fails = await pageRules({ [file]: text.replace(from, to) }, null);
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'death-popup --mutate: ' + bad + ' escaped' : 'death-popup --mutate: ' + PAGE_MUTANTS.length + '/' + PAGE_MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
