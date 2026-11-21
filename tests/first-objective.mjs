#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/first-objective.mjs — THE FIRST OBJECTIVE IS NEVER UNDER CHAT (designer ruling D-1, review/05-designer-rulings.md section 1.3
//   rule 6; FB-5, 2026-11-21; review/02-four-hero-hour.md quit point 1: "Tamsin's board was hidden under the Chat window").
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs) on tests/fixtures/alpha-envelope.json, as a hero in
// town who has hunted nothing yet. Chat stands open at its home from the start on a desktop (2026-10-22, chat-social CW-12). At 1280x720
// and 1920x1080, measured from layout (getBoundingClientRect), never from constants:
//   FO-1  the coach's card is on screen, and its box does not touch Chat's box
//   FO-2  the control the card rings is on screen, and its box does not touch Chat's box
//   FO-3  the card's ring is a screen control (an icon, a menu line or a control in a window), never the World behind the windows
//   FO-4  pressed, the ringed control opens its window; the card and the control it rings there stay clear of Chat
//
//   node tests/first-objective.mjs            the guard
//   node tests/first-objective.mjs --mutate   each planted defect must turn its own line red
//
// mutant-anchors: src/styles/shell.css src/data/shell-windows.js
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { leaseBrowser } from './_chrome.mjs';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';
import { withServerLevel } from './_server-level.mjs';
import { isMain } from './_is-main.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const wait = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
export const SIZES = Object.freeze([{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]);

/* A hero in town who has hunted nothing yet (top-bar.mjs fresh): the first hour's card is the coach's. */
function fresh(e) {
  for (const k of ['hunt', 'hunt_analyzer', 'hunt_track', 'hunt_events', 'party', 'hunt_bests']) delete e[k];
  e.state = Object.assign({}, e.state, { active_kind: 'idle', active_id: null, level_xp: 0 });
  for (const k of Object.keys(e.skills)) if (['melee', 'defense', 'inner_flame', 'magic', 'ranged'].includes(k)) e.skills[k] = { xp: 0, level: 1 };
  e.tally = { held: [], paid_today: 0, per_day: 10, held_max: 3, weight: null, order: [], recent: [], day_ends_at: '2099-01-01T00:00:00Z' };
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_put_client_state') { try { Object.assign(s.residue, JSON.parse(r.request().postData() || '{}').p_patch || {}); } catch { /* kept */ } return json({ ok: true }); }
    if (name === 'hr_account_coach') return json({ ok: true, read: [], taught: [], v: 0 });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(withServerLevel(clone(s.env)), { version: ++s.version, ok: true, client_state: clone(s.residue) }));
    return json({ ok: true });
  });
}

/* Every box the rule reads, and whether two touch: { card, ring, chat, ringWhat } in page px. */
const READ = () => {
  const box = (e) => { if (!e || !e.getClientRects().length || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const card = document.querySelector('.hs-pointer:not([hidden])');
  const ring = Array.from(document.querySelectorAll('[data-coach-ring]')).find((e) => e.getClientRects().length) || null;
  const chat = document.querySelector('[data-hs-win="chat"]:not(.is-leaving)');
  return { card: box(card), ring: box(ring), chat: box(chat), cardId: card ? card.getAttribute('data-tutorial') : null,
    ringWhat: ring ? (ring.closest('#panel-world') && !ring.closest('[data-hs-win], [data-hs-widget], .hs-launchers') ? 'world' : (ring.getAttribute('data-hs-open') || ring.className || ring.tagName)) : null,
    ringOpens: ring ? ring.getAttribute('data-hs-open') : null };
};
const touch = (a, b) => !!a && !!b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

export async function check(size, overrides) {
  const fails = [];
  /* a mutant names a file and how to change its text: served over the page's own copy, never written to the tree */
  const served = {};
  for (const [rel, fn] of Object.entries(overrides || {})) served[rel] = fn(await readFile(join(ROOT, rel), 'utf8'));
  const { server, port } = await serve(served);
  const browser = await leaseBrowser(chromium);
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  try {
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const env = clone(BASE_ENV); fresh(env);
    const s = { env, version: 1, residue: {} };
    await stub(page, s);
    await page.goto('http://127.0.0.1:' + port + '/play.html', { waitUntil: 'load', timeout: 45000 });
    await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
    await page.fill('input[name=email]', 'qa@example.test');
    await page.fill('input[name=password]', 'not-a-real-password');
    await page.click('.auth-submit');
    await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
    await page.click('[data-app="play"][data-slot="0"]');
    const tag = size.width + 'x' + size.height;
    if (!(await wait(page, () => document.querySelector('.hs-launchers .hs-launch')))) { fails.push('FO-0 [' + tag + '] CONTROL: the World never came up'); return fails; }
    await wait(page, () => !!document.querySelector('[data-hs-win="chat"]') && !!document.querySelector('[data-coach-ring]'), null, 8000);
    await page.waitForTimeout(400);
    const a = await page.evaluate(READ);
    if (!a.chat) fails.push('FO-0 [' + tag + '] CONTROL: Chat is not open at its home');
    if (!a.card) fails.push('FO-1 [' + tag + '] no coach card on screen');
    else if (touch(a.card, a.chat)) fails.push('FO-1 [' + tag + '] the card "' + a.cardId + '" touches Chat: ' + JSON.stringify([a.card, a.chat]));
    if (!a.ring) fails.push('FO-2 [' + tag + '] the card rings nothing on screen');
    else if (touch(a.ring, a.chat)) fails.push('FO-2 [' + tag + '] the ringed control ' + a.ringWhat + ' touches Chat: ' + JSON.stringify([a.ring, a.chat]));
    if (a.ringWhat === 'world') fails.push('FO-3 [' + tag + '] the card rings a thing in the World, not a screen control');
    /* FO-4: press the ringed icon; in its window the card and its ring stay clear of Chat */
    if (a.ringOpens) {
      await page.click('[data-coach-ring]', { timeout: 2500 }).catch(() => null);
      await wait(page, (id) => !!document.querySelector('[data-hs-win="' + id + '"]:not(.is-leaving)'), a.ringOpens, 4000);
      await page.waitForTimeout(500);
      const b = await page.evaluate(READ);
      const win = await page.evaluate((id) => { const w = document.querySelector('[data-hs-win="' + id + '"]'); if (!w) return null; const r = w.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }, a.ringOpens);
      if (!win) fails.push('FO-4 [' + tag + '] the ringed icon opened no window');
      if (b.ring && touch(b.ring, b.chat)) fails.push('FO-4 [' + tag + '] in ' + a.ringOpens + ' the ringed control touches Chat: ' + JSON.stringify([b.ring, b.chat]));
      if (b.card && touch(b.card, b.chat)) fails.push('FO-4 [' + tag + '] in ' + a.ringOpens + ' the card touches Chat');
    }
  } finally { await ctx.close(); server.close(); }
  return fails;
}

/* Each mutant is served over the page's own copy, never written to the tree. */
const MUTANTS = [
  /* Chat's home moved under the icon row, where the card docks (the icon row itself, and so the ring on Hunts, stays clear) */
  ['Chat opens where the card docks (FO-1)', { 'src/styles/shell.css': (css) => css + '\n[data-hs-win="chat"] { left: auto !important; right: 0 !important; top: 58px !important; bottom: auto !important; }\n' }, 'FO-1'],
  ['Chat opens over the icon row (FO-2)', { 'src/styles/shell.css': (css) => css + '\n[data-hs-win="chat"] { left: auto !important; right: 0 !important; top: 0 !important; bottom: auto !important; }\n' }, 'FO-'],
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let missed = 0;
    for (const [name, overrides, expect] of MUTANTS) {
      const fails = await check(SIZES[0], overrides);
      const caught = fails.some((f) => f.startsWith(expect));
      console.log((caught ? '  ✓ ' : '  ✗ MISSED ') + name + (caught ? '' : ' (' + fails.join(' | ') + ')'));
      if (!caught) missed++;
    }
    console.log(missed ? 'first-objective --mutate: ' + missed + ' MISSED' : 'first-objective --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exit(missed ? 1 : 0);
  }
  const fails = [];
  for (const size of SIZES) fails.push(...await check(size));
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? 'first-objective: RED, ' + fails.length + ' finding(s)' : 'first-objective: the card and the control it rings stand clear of Chat at 1280x720 and 1920x1080');
  process.exit(fails.length ? 1 : 0);
}
if (isMain(import.meta.url)) await main();
