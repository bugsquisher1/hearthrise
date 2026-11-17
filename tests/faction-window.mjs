#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/faction-window.mjs — THE FACTIONS ON SCREEN, IN A REAL CHROMIUM (lane/b-faction-ui).
//
//   node tests/faction-window.mjs            the rules
//   node tests/faction-window.mjs --mutate   every planted defect must turn a rule RED
//   node tests/faction-window.mjs --shots <dir>   also write the desktop and phone screenshots
//
// mutant-anchors: src/shell/windows/faction-join.js src/shell/windows/character/faction.js src/shell/windows/character/index.js src/session/faction-sections.js src/session/faction-intents.js src/shell/faction-words.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is tests/fixtures/alpha-envelope.json
// ("Tyler", slot 0) in town, with a `factions` section in the shape of 2027-04-23-faction-section.sql hr_faction_section (the server
// half on the real chain is tests/faction-standing-db.mjs and that file's §4). hr_put_client_state is kept and played back, so a reload
// reads the residue the page wrote.
//   FW-1  SWITCH OFF: no `factions` section, so the Character window has no Faction tab, no prompt opens, and no faction verb is sent
//   FW-2  JOIN: a hero the server says can join gets the prompt by itself: both sides in the catalogue's order, each with its face's own
//         words and one Join press drawn the same way; "Not now" closes it, writes `faction:join` to the residue, and a reload doesn't ask
//         again; the tab offers "Choose a side"; Join sends ONE hr_faction_join naming only the slot, the side and a key, and the side
//         shows only from the re-read envelope ("Side: First Flame")
//   FW-3  CLAIM: a piece short of the server's standing has its Claim off ("Unlocks at: 25 h First Flame standing"); with enough it is
//         on and sends ONE hr_faction_outfit_claim naming only the slot, the piece and a key; a standing_short refusal says the server's
//         numbers; a held piece reads Claimed with nothing to press
//   FW-4  SWAP: inside the cooldown "Next swap: in 3 days" and the swap is off; past it, on; an open swap reads "Swap: 4 h 10 m left"
//         with Finish off; once the server's credited time covers the need, Finish is on
//   FW-5  THE PHONE (922x423): the Faction tab and the prompt are sheets inside the screen, nothing overflows sideways, no text under
//         12 px, and every Join press is reachable
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
const H = 3600000, DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();
const PIECES = [['flamebearer', 'first_flame', 25], ['flamebearer_shield', 'first_flame', 100], ['flamebearer_light', 'first_flame', 300],
  ['emberkeeper', 'last_ember', 25], ['emberkeeper_lantern', 'last_ember', 100], ['emberkeeper_coal', 'last_ember', 300]];
/* The section as hr_faction_section answers it. `standing` is written last-ember first: a jsonb object's keys come back by length. */
function section(o = {}) {
  return { faction: o.faction || null, can_join: !!o.canJoin, joined_at: o.faction ? iso(Date.now() - DAY) : null,
    swap: o.swap || null, swap_ready_at: o.faction ? iso(o.readyAt !== undefined ? o.readyAt : Date.now() + 6 * DAY) : null,
    standing: { last_ember: o.ember || 0, first_flame: o.flame || 0 }, today_ms: 0, day_cap_ms: DAY,
    pieces: PIECES.map(([id, side, h]) => ({ id, faction: side, need_ms: h * H, held: (o.held || []).includes(id) })),
    swap_need_ms: 10 * H, cooldown_ms: 7 * DAY };
}
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') {
      const env = Object.assign(clone(s.env), { version: ++s.version, ok: true, hunt_server_now_ms: Date.now(), client_state: clone(s.residue) });
      if (s.factions) env.factions = clone(s.factions); else delete env.factions;
      return json(env);
    }
    if (name === 'hr_put_client_state') { Object.assign(s.residue, body.p_patch || {}); return json({ ok: true }); }
    if (/^hr_faction_/.test(name)) {
      const a = s.answer ? s.answer(name, body) : { ok: true };
      return json(a);
    }
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load' });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

const verbs = (s) => s.calls.filter((c) => /^hr_faction_/.test(c.name));
const promptOpen = (page) => page.evaluate(() => !!document.querySelector('[data-hs-win="faction-join"]'));
async function factionTab(page) {
  if (!(await page.evaluate(() => !!document.querySelector('[data-hs-win="character"]')))) await page.keyboard.press('c');
  await wait(page, () => document.querySelector('[data-hs-win="character"] .hw-tab[data-tab="faction"]'));
  await page.click('.hw-tab[data-tab="faction"]');
  return wait(page, () => document.querySelector('[data-pane="faction"].is-on .hw-fx-side')?.textContent);
}
const tabText = (page) => page.evaluate(() => document.querySelector('.hw-cs-faction').innerText.replace(/\n+/g, ' | '));
const pieces = (page) => page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('.hw-fx-piece')).map((li) => {
  const b = li.querySelector('button');
  return [b.getAttribute('data-piece'), { small: li.querySelector('small').textContent, press: b.hidden ? 'none' : b.disabled ? 'off' : 'on' }];
})));

async function checks(overrides, shots) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (viewport, s0, touch) => {
    const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = Object.assign({ env: Object.assign(clone(BASE_ENV), clone(TOWN)), version: 1, calls: [], residue: {}, factions: null, answer: null }, s0);
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, s, up };
  };
  try {
    { // FW-1
      const { ctx, page, errors, s, up } = await open({ width: 1440, height: 900 }, {});
      if (!up) fails.push('FW-1 the World never came up');
      await page.keyboard.press('c');
      await wait(page, () => document.querySelector('[data-hs-win="character"] .hw-tab'));
      await page.waitForTimeout(400);
      const tab = await page.evaluate(() => { const b = document.querySelector('.hw-tab[data-tab="faction"]'); return b ? { hidden: b.hidden, shown: !!b.getClientRects().length } : null; });
      if (!tab || !tab.hidden || tab.shown) fails.push('FW-1 with the switch off the Faction tab is ' + JSON.stringify(tab));
      if (await promptOpen(page)) fails.push('FW-1 with the switch off the join prompt opened');
      if (verbs(s).length) fails.push('FW-1 with the switch off the page sent ' + verbs(s).map((c) => c.name));
      if (errors.length) fails.push('FW-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // FW-2
      const st = { factions: section({ canJoin: true }) };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, st);
      s.answer = (name, body) => { if (name === 'hr_faction_join') s.factions = section({ faction: body.p_faction }); return { ok: true, faction: {} }; };
      const opened = await wait(page, () => document.querySelectorAll('[data-hs-win="faction-join"] .hfx-side').length === 2);
      if (!opened) fails.push('FW-2 a hero the server says can join got no prompt');
      else {
        const sides = await page.evaluate(() => Array.from(document.querySelectorAll('[data-hs-win="faction-join"] .hfx-side')).map((li) => {
          const b = li.querySelector('[data-hs-act="fx-join"]'), cs = getComputedStyle(b);
          return { name: li.querySelector('.hfx-name').textContent, who: li.querySelector('cite').textContent, said: li.querySelector('blockquote p').textContent,
            press: b.textContent, look: b.className + '|' + cs.backgroundColor + '|' + cs.borderImageSource + '|' + cs.fontFamily + '|' + Math.round(b.getBoundingClientRect().height) };
        }));
        const got = sides.map((x) => x.name + ' / ' + x.who + ' / ' + x.press).join(' | ');
        if (got !== 'The First Flame / Holly / Join the First Flame | The Last Ember / Quartermaster Venn / Join the Last Ember') fails.push('FW-2 the prompt reads ' + got);
        if (sides.some((x) => x.said.length < 40)) fails.push('FW-2 a side has no words of its own face: ' + JSON.stringify(sides.map((x) => x.said)));
        if (new Set(sides.map((x) => x.look)).size !== 1) fails.push('FW-2 the two Join presses are not drawn the same: ' + JSON.stringify(sides.map((x) => x.look)));
        if (shots) await page.screenshot({ path: join(shots, 'faction-join-desktop.png') });
        await page.click('[data-hs-act="fx-not-now"]');
        await page.waitForTimeout(900);
        const seen = (s.residue.alerts && s.residue.alerts.seen) || [];
        if (await promptOpen(page)) fails.push('FW-2 Not now left the prompt open');
        if (!seen.includes('faction:join')) fails.push('FW-2 Not now wrote no residue: ' + JSON.stringify(s.residue));
        if (verbs(s).length) fails.push('FW-2 Not now sent ' + verbs(s).map((c) => c.name));
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'), null, 4000) && await page.click('[data-app="play"][data-slot="0"]');
        await wait(page, () => document.querySelector('.hs-launchers'));
        await page.waitForTimeout(1200);
        if (await promptOpen(page)) fails.push('FW-2 after Not now a reload asked again');
        if (!(await factionTab(page))) fails.push('FW-2 the Faction tab never drew');
        const t1 = await tabText(page);
        if (!/^Side: none \|/.test(t1) || !/Choose a side/.test(t1) || !/Holly and Quartermaster Venn are waiting, pick any time/.test(t1)) fails.push('FW-2 the neutral tab reads ' + t1.slice(0, 200));
        await page.click('[data-hs-act="fx-choose"]');
        if (!(await wait(page, () => document.querySelector('[data-hs-win="faction-join"] [data-side="first_flame"]')))) fails.push('FW-2 Choose a side opened no prompt');
        else {
          await page.click('[data-hs-win="faction-join"] [data-side="first_flame"]');
          const closed = await wait(page, () => !document.querySelector('[data-hs-win="faction-join"]'));
          const sent = verbs(s);
          const keys = sent.length ? Object.keys(sent[0].body).sort().join(',') : '';
          if (sent.length !== 1 || sent[0].name !== 'hr_faction_join' || keys !== 'p_faction,p_idem,p_slot' || sent[0].body.p_faction !== 'first_flame' || sent[0].body.p_slot !== 0)
            fails.push('FW-2 Join sent ' + JSON.stringify(sent));
          if (!closed) fails.push('FW-2 the prompt stayed open after the join');
          await factionTab(page);
          const drawn = await wait(page, () => /^Side: First Flame$/.test(document.querySelector('.hw-fx-side')?.textContent || ''));
          if (!drawn) fails.push('FW-2 after the re-read the tab reads ' + (await tabText(page)).slice(0, 120));
        }
      }
      if (errors.length) fails.push('FW-2 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // FW-3
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, { factions: section({ faction: 'first_flame', flame: 20 * H }) });
      await factionTab(page);
      let p = await pieces(page);
      if (!p.flamebearer || p.flamebearer.press !== 'off' || p.flamebearer.small !== 'Unlocks at: 25 h First Flame standing') fails.push('FW-3 a piece short of standing reads ' + JSON.stringify(p.flamebearer));
      if (!/First Flame \| Standing: 20 h/.test(await tabText(page))) fails.push('FW-3 the standing reads ' + (await tabText(page)).slice(0, 200));
      await page.click('[data-hs-act="fx-claim"][data-piece="flamebearer"]', { force: true }).catch(() => {});
      await page.waitForTimeout(300);
      if (verbs(s).length) fails.push('FW-3 a Claim that was off sent ' + verbs(s).map((c) => c.name));
      /* standing enough: the server's next envelope */
      s.factions = section({ faction: 'first_flame', flame: 30 * H });
      s.answer = (name) => (name === 'hr_faction_outfit_claim' ? { ok: false, error: 'standing_short', piece: 'flamebearer', need_ms: 25 * H, have_ms: 24 * H } : { ok: true });
      await page.reload({ waitUntil: 'load' });
      await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'), null, 4000) && await page.click('[data-app="play"][data-slot="0"]');
      await wait(page, () => document.querySelector('.hs-launchers'));
      await factionTab(page);
      p = await pieces(page);
      if (!p.flamebearer || p.flamebearer.press !== 'on' || p.flamebearer_shield.press !== 'off' || p.emberkeeper.press !== 'off') fails.push('FW-3 with 30 h the claims read ' + JSON.stringify(p));
      await page.click('[data-hs-act="fx-claim"][data-piece="flamebearer"]');
      const said = await wait(page, () => /needs 25 h First Flame standing\. Standing: 24 h/.test(document.querySelector('.hw-cs-faction .hh-intent-msg')?.textContent || ''));
      const sent = verbs(s);
      const keys = sent.length ? Object.keys(sent[0].body).sort().join(',') : '';
      if (sent.length !== 1 || sent[0].name !== 'hr_faction_outfit_claim' || keys !== 'p_idem,p_piece,p_slot' || sent[0].body.p_piece !== 'flamebearer') fails.push('FW-3 Claim sent ' + JSON.stringify(sent));
      if (!said) fails.push('FW-3 the standing_short refusal reads ' + JSON.stringify(await page.evaluate(() => document.querySelector('.hw-cs-faction .hh-intent-msg')?.textContent)));
      /* held */
      s.factions = section({ faction: 'first_flame', flame: 30 * H, held: ['flamebearer'] });
      s.answer = () => ({ ok: true, faction: {} });
      await page.click('[data-hs-act="fx-claim"][data-piece="flamebearer"]');
      const held = await wait(page, () => { const li = document.querySelector('[data-piece="flamebearer"]')?.closest('li'); return li && li.querySelector('button').hidden && li.querySelector('small').textContent === 'Claimed'; });
      if (!held) fails.push('FW-3 a held piece reads ' + JSON.stringify((await pieces(page)).flamebearer));
      if (shots) await page.screenshot({ path: join(shots, 'faction-tab-desktop.png') });
      if (errors.length) fails.push('FW-3 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // FW-4
      const st = { factions: section({ faction: 'first_flame', readyAt: Date.now() + 2 * DAY + 5 * H }) };
      const { ctx, page, errors, s } = await open({ width: 1440, height: 900 }, st);
      await factionTab(page);
      const state = () => page.evaluate(() => ({ line: document.querySelector('.hw-fx-swap-state').textContent,
        swap: (() => { const b = document.querySelector('[data-hs-act="fx-swap"]'); return b.hidden ? 'none' : b.disabled ? 'off' : 'on'; })(),
        finish: (() => { const b = document.querySelector('[data-hs-act="fx-finish"]'); return b.hidden ? 'none' : b.disabled ? 'off' : 'on'; })(),
        press: document.querySelector('[data-hs-act="fx-swap"]').textContent }));
      let x = await state();
      if (x.line !== 'Next swap: in 3 days' || x.swap !== 'off' || x.finish !== 'none') fails.push('FW-4 inside the cooldown the swap reads ' + JSON.stringify(x));
      await page.click('[data-hs-act="fx-swap"]', { force: true }).catch(() => {});
      await page.waitForTimeout(300);
      if (verbs(s).length) fails.push('FW-4 a Swap inside the cooldown sent ' + verbs(s).map((c) => c.name));
      const again = async (o) => {
        s.factions = section(o);
        await page.reload({ waitUntil: 'load' });
        await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'), null, 4000) && await page.click('[data-app="play"][data-slot="0"]');
        await wait(page, () => document.querySelector('.hs-launchers'));
        await factionTab(page);
        return state();
      };
      x = await again({ faction: 'first_flame', readyAt: Date.now() - H });
      if (x.line !== 'Next swap: ready' || x.swap !== 'on' || x.press !== 'Swap to the Last Ember') fails.push('FW-4 past the cooldown the swap reads ' + JSON.stringify(x));
      x = await again({ faction: 'first_flame', swap: { to: 'last_ember', started_at: iso(Date.now() - DAY), ms: 10 * H - (4 * H + 10 * 60000), need_ms: 10 * H } });
      if (x.line !== 'Swap: 4 h 10 m left' || x.finish !== 'off' || x.swap !== 'none') fails.push('FW-4 an open swap reads ' + JSON.stringify(x));
      x = await again({ faction: 'first_flame', swap: { to: 'last_ember', started_at: iso(Date.now() - DAY), ms: 10 * H, need_ms: 10 * H } });
      if (x.line !== 'Swap: ready to finish' || x.finish !== 'on') fails.push('FW-4 a swap with its time reads ' + JSON.stringify(x));
      await page.click('[data-hs-act="fx-finish"]');
      await page.waitForTimeout(500);
      const sent = verbs(s);
      if (sent.length !== 1 || sent[0].name !== 'hr_faction_swap_finish' || Object.keys(sent[0].body).sort().join(',') !== 'p_idem,p_slot') fails.push('FW-4 Finish sent ' + JSON.stringify(sent));
      if (errors.length) fails.push('FW-4 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // FW-5
      const { ctx, page, errors } = await open({ width: 922, height: 423 }, { factions: section({ canJoin: true }) }, true);
      const opened = await wait(page, () => document.querySelectorAll('[data-hs-win="faction-join"] .hfx-side').length === 2);
      await page.waitForTimeout(600);
      const measure = (sel) => page.evaluate((q) => {
        const w = document.querySelector(q);
        if (!w) return null;
        const body = w.querySelector('[data-hs-body]') || w;
        let small = null;
        for (const e of w.querySelectorAll('*')) {
          if (!e.childNodes.length || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
          const fs = parseFloat(getComputedStyle(e).fontSize);
          if (e.getClientRects().length && fs < 12 && (!small || fs < small.fs)) small = { fs, text: e.textContent.trim().slice(0, 30) };
        }
        const r = w.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), over: body.scrollWidth - body.clientWidth, small, vw: innerWidth };
      }, sel);
      if (!opened) fails.push('FW-5 the phone never drew the prompt');
      else {
        const m = await measure('[data-hs-win="faction-join"]');
        if (!m || m.left < 0 || m.right > m.vw || m.over > 1) fails.push('FW-5 the phone prompt is ' + JSON.stringify(m));
        if (m && m.small) fails.push('FW-5 text under 12 px in the phone prompt: ' + JSON.stringify(m.small));
        for (const side of ['first_flame', 'last_ember']) {
          const b = page.locator('[data-hs-win="faction-join"] [data-side="' + side + '"]');
          await b.scrollIntoViewIfNeeded().catch(() => {});
          const box = await b.boundingBox();
          if (!box || box.y < 0 || box.y + box.height > 423 || box.height < 40) fails.push('FW-5 the phone Join ' + side + ' press is ' + JSON.stringify(box));
        }
        if (shots) await page.screenshot({ path: join(shots, 'faction-join-phone-922x423.png') });
        await page.click('[data-hs-act="fx-not-now"]');
      }
      await factionTab(page);
      await page.waitForTimeout(400);
      const m = await measure('[data-hs-win="character"]');
      if (!m || m.left < 0 || m.right > m.vw || m.over > 1) fails.push('FW-5 the phone Faction tab is ' + JSON.stringify(m));
      if (m && m.small) fails.push('FW-5 text under 12 px on the phone Faction tab: ' + JSON.stringify(m.small));
      if (shots) await page.screenshot({ path: join(shots, 'faction-tab-phone-922x423.png') });
      if (errors.length) fails.push('FW-5 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally {
    server.close();
  }
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['the tab shows with the switch off', 'src/shell/windows/character/index.js', "  prop(root.querySelector('.hw-tab[data-tab=\"faction\"]'), 'hidden', !fx);", "  prop(root.querySelector('.hw-tab[data-tab=\"faction\"]'), 'hidden', false);"],
  ['the prompt never opens by itself', 'src/shell/windows/faction-join.js', '    if (!joinDue(cs) || ctx.wm.isOpen(\'faction-join\')) return;', '    if (true) return;'],
  ['Not now is not kept', 'src/shell/windows/faction-join.js', "  if (action === 'fx-not-now') { dismiss(cs); ctx.wm.close('faction-join'); return true; }", "  if (action === 'fx-not-now') { DISMISSED.add(cs); ctx.wm.close('faction-join'); return true; }"],
  ['the sides come in the jsonb key order', 'src/session/faction-sections.js', '  const sides = [...new Set([...pieces.map((p) => p.side), ...Object.keys(standing)])];', '  const sides = Object.keys(standing);'],
  ['one side gets the gold plate', 'src/shell/windows/faction-join.js', "      + '<button type=\"button\" class=\"hh-tool\" data-hs-act=\"fx-join\"", "      + '<button type=\"button\" class=\"hh-tool' + (s === 'first_flame' ? ' is-primary' : '') + '\" data-hs-act=\"fx-join\""],
  ['the join sends a number', 'src/session/faction-intents.js', "rpc('hr_faction_join', { p_slot: cs.slot, p_faction: side, p_idem: newIdem() })", "rpc('hr_faction_join', { p_slot: cs.slot, p_faction: side, p_kills: 1, p_idem: newIdem() })"],
  ['a claim is on short of standing', 'src/session/faction-sections.js', 'export const claimable = (f, p) => !!f && !!p && !p.held && standingOn(f, p.side) >= p.needMs;', 'export const claimable = (f, p) => !!f && !!p && !p.held;'],
  ['a refusal hides the server\'s numbers', 'src/shell/faction-words.js', "  if (r.error === 'standing_short' && num(r.needMs) && num(r.haveMs)) {", "  if (false) {"],
  ['the swap is on inside the cooldown', 'src/shell/faction-words.js', 'export const swapReady = (f, serverNowMs) => !!f && !!f.side && !f.swap && f.swapReadyAt !== null && serverNowMs >= f.swapReadyAt;', 'export const swapReady = (f) => !!f && !!f.side && !f.swap;'],
  ['the cooldown rounds down', 'src/shell/faction-words.js', "t('factions.next_swap_days', { count: Math.ceil(left / DAY_MS) })", "t('factions.next_swap_days', { count: Math.floor(left / DAY_MS) })"],
  ['Finish is on short of the hours', 'src/shell/windows/character/faction.js', "  prop(fin, 'disabled', sc.pending || !(f && f.swap && f.swap.ms >= f.swap.needMs));", "  prop(fin, 'disabled', sc.pending || !(f && f.swap));"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'faction-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'faction-window: ' + fails.length + ' rule(s) RED'
      : 'faction-window: hidden with the switch off; the prompt asks once with both sides drawn the same, Not now kept; one join, the side from the re-read; claims and swaps off until the server\'s numbers allow; a sheet on the phone');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await checks(null);
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const text = (await readFile(join(ROOT, file), 'utf8')).replace(/\r\n/g, '\n');
    if (text.split(from).length !== 2) { console.log('  ✗ ' + name + ' — anchor not found once in ' + file); bad++; continue; }
    const fails = await checks({ [file]: text.replace(from, () => to) });
    if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(' ')[0] + ')');
    else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
  }
  console.log(bad ? 'faction-window --mutate: ' + bad + ' escaped' : 'faction-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
