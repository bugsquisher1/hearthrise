#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/boss-call-window.mjs — CALL OUT ON THE GROUND'S PAGE, IN A REAL CHROMIUM (src/shell/windows/boss-call-pane.js; the money line is tests/boss-call.mjs, the server tests/boss-call-db.mjs).
//
//   node tests/boss-call-window.mjs            the rules
//   node tests/boss-call-window.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/shell/windows/boss-call-pane.js src/hunt-view/summary-model.js src/hunt-view/boss-loss.js src/shell/widgets/boss-bar.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs).
//   BW-1  THE SERVER'S WORDS: alone, the page says why and the press is off; a member reads the leader's line; a ground with no boss to call shows nothing
//   BW-2  THE WARNING, THEN ONE PRESS: the press only opens the warning, at the server's price (nothing sent); Not yet closes it; confirming sends ONE hr_boss_call with the id and the QUOTED price
//   BW-3  A MOVED PRICE: quote_changed shows the server's new price and the words say nothing was charged; the next press carries the new price
//   BW-4  NO ANSWER, NO PRESS, NO HAMMER: a server that won't quote leaves the press off and is not asked again on the repaint its own answer causes
//   BW-5  NO FREE WAY BACK: Hunt again has nothing to send from a called room, and says why; a normal hunt's still does; both ends have their words
//   BW-6  THE LOSING LINE: names the phase and his HP from the server's record, this hero's own count, and what answers it; a won fight, a walk-out and a normal hunt have none; it survives the residue's bounds
//   BW-7  THE BOSS BAR: his name, a mark on each line where the row puts it, his HP at the instant shown, what each line brought; quiet on any other hunt, and once the fight is over
//
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const PID = '00000000-0000-4000-8000-00000000bc01';
const seat = (seatNo, name) => ({ seat: seatNo, name, level: 25, slot: 0, hunting: false, weapon: 'iron_sword', role: 'tank' });
const PARTY = (self, leader = 0) => ({ party: { id: PID, max: 4, hunt: null, open: false, self_seat: self, leader_seat: leader, members: [seat(0, 'Marlow'), seat(1, 'Tessaly')] } });
const QUOTE = (o) => Object.assign({ call: 'rat_king', available: true, why: null, price: 10000, used: 1, per_day: 3, left: 2, seats: 2, party_min: 2 }, o);
const wait = (page, fn, arg, ms = 8000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const body = JSON.parse(r.request().postData() || '{}');
    s.calls.push({ name, body });
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    if (name === 'hr_boss_call_view') return s.view === null ? json({ ok: false, error: 'rate_limited' }) : json({ ok: true, quote: s.view });
    if (name === 'hr_boss_call') return json(s.answer ? s.answer(body) : { ok: true, boss_call: s.view });
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  /* the page's first load is the harness, not a rule: a cold or loaded runner takes it past the 6 s rule timeout (tests/tally-window.mjs) */
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 60000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

async function checks(overrides) {
  const fails = [];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  /* The Hunts window on `hunt`'s page, for a hero with these sections and this quote. */
  const open = async (sections, view, answer, hunt = 'millrace_sewer') => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(6000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/400|404/.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    /* the fixture's hero hunts, in a party: this one stands in town, alone unless `sections` seat it */
    const env = Object.assign(clone(BASE_ENV), { hunt: null, party: null, hunt_track: null, hunt_events: null, hunt_analyzer: null }, sections);
    env.state = Object.assign({}, env.state, { active_kind: 'idle', active_id: null });
    const s = { env, version: 1, calls: [], view, answer };
    await stub(page, s);
    await signInAndPlay(page, 'http://127.0.0.1:' + port);
    await page.click('[data-hs-open="hunts"]');
    await page.click('.hw-hunt[data-hunt="' + hunt + '"]');
    await page.waitForTimeout(600);
    return { ctx, page, errors, s };
  };
  const sent = (s, n) => s.calls.filter((c) => c.name === n);
  const txt = (page, sel) => page.evaluate((q) => { const e = document.querySelector('.hw-hd-call ' + q); return e ? e.textContent : null; }, sel);
  const shown = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && e.offsetParent !== null; }, sel);
  const press = async (page, sel, rule) => { try { await page.click(sel, { timeout: 1500 }); return true; } catch { fails.push(rule + ' could not press ' + sel); return false; } };
  const off = (page) => page.evaluate(() => { const b = document.querySelector('.hw-call-press'); return b ? b.disabled : null; });
  try {
    /* BW-1 */
    {
      const { ctx, page, errors, s } = await open({}, QUOTE({ available: false, why: 'call_party', seats: 1 }));
      if (!/The Rat King wants a party of two or more\./.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-1 alone reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== true) fails.push('BW-1 alone, the press is not off');
      if (!/Call out the Rat King: 10,000 gp/.test(await txt(page, '.hw-call-press') || '')) fails.push('BW-1 the press reads ' + JSON.stringify(await txt(page, '.hw-call-press')));
      await page.click('.hw-hunt[data-hunt="mill_cellar"]');
      await page.waitForTimeout(200);
      if (await shown(page, '.hw-hd-call')) fails.push('BW-1 a ground with no boss to call shows the section');
      if (errors.length) fails.push('BW-1 console errors: ' + errors.join(' | ').slice(0, 300));
      if (sent(s, 'hr_boss_call').length) fails.push('BW-1 something was charged');
      await ctx.close();
    }
    {
      const { ctx, page } = await open(PARTY(1), QUOTE({ available: false, why: 'call_leader' }));
      if (!/Only your party's leader can call him out\./.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-1 a member reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== true) fails.push('BW-1 a member\'s press is not off');
      await ctx.close();
    }
    /* BW-2 */
    {
      const { ctx, page, s, errors } = await open(PARTY(0), QUOTE({}));
      if (!/2 calls left today\./.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-2 the page reads ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (await off(page) !== false) fails.push('BW-2 the leader\'s press is off');
      await press(page, '[data-hs-act="call-warn"]', 'BW-2');
      await page.waitForTimeout(150);
      if (sent(s, 'hr_boss_call').length) fails.push('BW-2 the first press charged');
      if (!await shown(page, '.hw-call-warn')) fails.push('BW-2 no warning');
      const warned = await txt(page, '.hw-call-warn') || '';
      if (!/A death ends the fight/.test(warned) || !/10,000 gp from your purse, win or lose/.test(warned) || !/no XP, no coin and no drops/.test(warned) || !/At half his health his adds come/.test(warned) || !/At a quarter he rages/.test(warned)) fails.push('BW-2 the warning reads ' + JSON.stringify(warned));
      await press(page, '[data-hs-act="call-no"]', 'BW-2');
      await page.waitForTimeout(150);
      if (await shown(page, '.hw-call-warn')) fails.push('BW-2 Not yet left the warning up');
      await press(page, '[data-hs-act="call-warn"]', 'BW-2');
      await press(page, '[data-hs-act="call-go"]', 'BW-2');
      await page.waitForTimeout(500);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 1) fails.push('BW-2 ' + calls.length + ' calls went out');
      else if (calls[0].body.p_call !== 'rat_king' || calls[0].body.p_price !== 10000 || calls[0].body.p_slot !== 0 || !calls[0].body.p_idem || Object.keys(calls[0].body).length !== 4) fails.push('BW-2 the press sent ' + JSON.stringify(calls[0].body));
      if (errors.length) fails.push('BW-2 console errors: ' + errors.join(' | ').slice(0, 300));
      await ctx.close();
    }
    /* BW-3 */
    {
      const moved = QUOTE({ price: 12000 });
      const { ctx, page, s } = await open(PARTY(0), QUOTE({}), (b) => (b.p_price === 12000 ? { ok: true, boss_call: moved } : { ok: false, error: 'quote_changed', boss_call: moved }));
      await press(page, '[data-hs-act="call-warn"]', 'BW-3');
      await press(page, '[data-hs-act="call-go"]', 'BW-3');
      await page.waitForTimeout(500);
      const msg = await page.evaluate(() => (document.querySelector('.hw-hunts .hh-intent-msg') || {}).textContent || '');
      if (!/weren't charged/.test(msg)) fails.push('BW-3 the answer reads ' + JSON.stringify(msg));
      if (!/12,000 gp/.test(await txt(page, '.hw-call-press') || '')) fails.push('BW-3 the press still reads ' + JSON.stringify(await txt(page, '.hw-call-press')));
      await press(page, '[data-hs-act="call-warn"]', 'BW-3');
      await press(page, '[data-hs-act="call-go"]', 'BW-3');
      await page.waitForTimeout(500);
      const calls = sent(s, 'hr_boss_call');
      if (calls.length !== 2 || calls[1].body.p_price !== 12000) fails.push('BW-3 the second press sent ' + JSON.stringify(calls.map((c) => c.body.p_price)));
      await ctx.close();
    }
    /* BW-4 */
    {
      const { ctx, page, s } = await open(PARTY(0), null);
      await page.waitForTimeout(1500);
      if (await off(page) !== true) fails.push('BW-4 with no quote the press is on');
      if (!/hasn't said yet/.test(await txt(page, '.hw-call-line') || '')) fails.push('BW-4 off with no words: ' + JSON.stringify(await txt(page, '.hw-call-line')));
      if (sent(s, 'hr_boss_call_view').length > 1) fails.push('BW-4 asked ' + sent(s, 'hr_boss_call_view').length + ' times in a moment');
      await ctx.close();
    }
    /* BW-5: the module as this page serves it (a mutant's text included). */
    {
      const { ctx, page } = await open({}, QUOTE({ available: false, why: 'call_party' }));
      const r = await page.evaluate(async () => {
        const v = new URL(Array.from(document.querySelectorAll('link[rel="modulepreload"]'), (l) => l.href).find((h) => h.includes('/summary-model.js'))).search;
        const M = await import('/src/hunt-view/summary-model.js' + v);
        return { room: M.huntAgainOf({ hunt: 'millrace_sewer_called', preset: 0, hoursLimit: null, bag: [] }), ground: M.huntAgainOf({ hunt: 'millrace_sewer', preset: 0, hoursLimit: null, bag: [] }),
          felled: M.endWords('boss_felled'), time: M.endWords('boss_time') };
      });
      if (r.room !== null) fails.push('BW-5 Hunt again has something to send from a called room');
      if (!r.ground) fails.push('BW-5 Hunt again is gone from a normal hunt');
      if (r.felled === 'The hunt ended.' || r.time === 'The hunt ended.') fails.push('BW-5 an end has no words: ' + JSON.stringify(r));
      await ctx.close();
    }
    /* BW-6, BW-7: the modules as this page serves them. */
    {
      const { ctx, page } = await open({}, QUOTE({ available: false, why: 'call_party' }));
      const r = await page.evaluate(async () => {
        const hrefOf = (name) => new URL(Array.from(document.querySelectorAll('link[rel="modulepreload"]'), (l) => l.href).find((h) => h.includes(name)));
        const L = await import(hrefOf('/boss-loss.js').href);
        const S = await import(hrefOf('/summary-model.js').href);
        const B = await import(hrefOf('/boss-bar.js').href);
        const P = await import(hrefOf('/boss-call-pane.js').href);
        const BC = await import(hrefOf('/boss-calls.js').href);
        const room = 'millrace_sewer_called';
        const line = (reason, boss_pm, fired, role, hunt = room) => L.lossLine({ hunt, reason, fight: { boss_pm, fired }, role });
        const lines = {
          enrageTank: line('died', 230, { eat: 6, challenge: 2 }, 'tank'), enrageHealer: line('party_member_died', 230, { greater_mend: 9, circle_of_renewal: 3, eat: 1 }, 'healer'),
          addsMage: line('died', 410, { fireball: 0, frost_lance: 4 }, 'mage'), addsHealer: line('died', 410, { greater_mend: 2, eat: 9 }, 'healer'), addsTank: line('party_member_died', 410, { challenge: 1 }, 'tank'),
          first: line('died', 800, { eat: 1 }, 'melee_dps'), time: line('boss_time', 230, { eat: 1 }, 'tank'), floor: line('died', 3, { eat: 1 }, 'tank'),
          won: line('boss_felled', 0, { eat: 1 }, 'tank'), left: line('left', 230, { eat: 1 }, 'tank'), normal: line('died', 230, { eat: 1 }, 'tank', 'millrace_sewer'),
          none: L.lossLine({ hunt: room, reason: 'died', fight: null, role: 'tank' }),
          /* The Chief's diggers shield him (isGuarded): his add wave has its own answer; his enrage does not. */
          chiefAdds: line('died', 410, { fireball: 3 }, 'mage', 'coppercap_warrens_called'), chiefEnrage: line('died', 230, { eat: 2 }, 'tank', 'coppercap_warrens_called'),
        };
        const sess = { read: (k) => (k === 'hunt' ? { session_id: 'sid', ended: true, session: { id: 'sid', hunt_id: room, end_reason: 'died', ended_at: '2026-11-05T10:00:00Z', tally: { deaths: 1, fight: { boss_pm: 230, fired: { eat: 6 } } } } } : null) };
        const ended = S.endedSessionOf(sess);
        const built = S.buildSummary(ended, null, [], 'tank');
        const kept = S.sanitizeSummaries([built])[0];
        const bar = (hunt, hp, over, played, kind = 'rat_king_called') => {
          const el = document.createElement('div');
          el.innerHTML = B.renderBossBar();
          const cs = { read: (k) => (k === 'hunt' ? { session_id: 's', hunt_id: hunt, ended: !!over, pose: { units: [{ u: 5, kind, side: 'monster', boss: true, name: 'Rat King', hp, hp_max: 1000 }] } } : null),
            timeline: { hpAt: () => played || null }, now: () => 0 };
          B.renderBossBar.patch(el, { character: cs });
          const q = (s) => el.querySelector(s);
          return { quiet: el.classList.contains('is-quiet'), name: q('.hs-boss-name').textContent, state: q('.hs-boss-state').textContent, fill: q('.hs-boss-fill').style.width,
            adds: q('.hs-boss-mark.is-adds').style.left, enrage: q('.hs-boss-mark.is-enrage').style.left, wave: q('.hs-boss').classList.contains('is-wave'), raging: q('.hs-boss').classList.contains('is-raging') };
        };
        return { lines, ended: ended && ended.fight, loss: built.loss, kept: kept && kept.loss,
          bars: { full: bar(room, 1000), half: bar(room, 500), quarter: bar(room, 240), played: bar(room, 1000, false, { hp: 240, maxHp: 1000 }), normal: bar('millrace_sewer', 1000), over: bar(room, 240, true), chief: bar('coppercap_warrens_called', 500, false, null, 'chief_coppercap_called') },
          warn: { king: P.callWords(BC.BOSS_CALL_WORDS.warn[0], BC.BOSS_CALLS.rat_king), chief: P.callWords(BC.BOSS_CALL_WORDS.warn[0], BC.BOSS_CALLS.chief_coppercap) } };
      });
      const l = r.lines;
      const want = (rule, name, re) => { if (!re.test(l[name] || '')) fails.push(rule + ' ' + name + ' reads ' + JSON.stringify(l[name])); };
      want('BW-6', 'enrageTank', /^Fell in the enrage at 23%: you ate 6 times\. .*eat earlier/);
      want('BW-6', 'enrageHealer', /^Fell in the enrage at 23%: your heals fired 12 times\./);
      want('BW-6', 'addsMage', /^Fell in the add wave at 41%: your area slots fired 0 times\. .*Cleave or Fireball/);
      want('BW-6', 'addsHealer', /^Fell in the add wave at 41%: your heals fired 2 times\./);
      want('BW-6', 'addsTank', /^Fell in the add wave at 41%: your Challenge fired 1 time\. /);
      want('BW-6', 'chiefAdds', /^Fell in the add wave at 41%: your area slots fired 3 times\. His adds shield him while they stand: set your damage dealers' Target to Lowest HP so they kill the adds before him\.$/);
      want('BW-6', 'chiefEnrage', /^Fell in the enrage at 23%: you ate 2 times\. Under a quarter of his health/);
      if (/shield/.test(l.addsMage || '')) fails.push('BW-6 the King, whose rats shield nothing, reads ' + JSON.stringify(l.addsMage));
      want('BW-6', 'first', /^Fell before his adds came, at 80%: you ate 1 time\. /);
      want('BW-6', 'time', /^Time ran out in the enrage at 23%: /);
      want('BW-6', 'floor', /at 1%:/);
      for (const n of ['won', 'left', 'normal', 'none']) if (l[n] !== null) fails.push('BW-6 ' + n + ' has a line: ' + l[n]);
      if (!r.ended || r.ended.boss_pm !== 230) fails.push('BW-6 the ended session lost the record: ' + JSON.stringify(r.ended));
      if (!/^Fell in the enrage at 23%: you ate 6 times/.test(r.loss || '')) fails.push('BW-6 the summary reads ' + JSON.stringify(r.loss));
      if (r.kept !== r.loss) fails.push('BW-6 the residue\'s bounds lost the line: ' + JSON.stringify(r.kept));
      const b = r.bars;
      if (b.full.quiet || b.full.name !== 'The Rat King' || b.full.adds !== '50%' || b.full.enrage !== '25%' || b.full.fill !== '100%' || b.full.wave || b.full.raging) fails.push('BW-7 at full he reads ' + JSON.stringify(b.full));
      if (!b.half.wave || b.half.raging || b.half.state !== 'His adds are coming') fails.push('BW-7 at the first line he reads ' + JSON.stringify(b.half));
      /* A boss whose adds shield him says so, on the bar and in the warning; one whose adds don't, never (boss-calls.js isGuarded). */
      if (!b.chief.wave || b.chief.state !== 'His adds shield him') fails.push('BW-7 the Chief at his first line reads ' + JSON.stringify(b.chief));
      if (!/They shield him until they fall. At a quarter/.test(r.warn.chief) || /shield/.test(r.warn.king) || /{guard}/.test(r.warn.king + r.warn.chief)) fails.push('BW-7 the warnings read ' + JSON.stringify(r.warn));
      if (b.quarter.wave || !b.quarter.raging || !/enraged/.test(b.quarter.state) || b.quarter.fill !== '24%') fails.push('BW-7 under the second line he reads ' + JSON.stringify(b.quarter));
      if (!b.played.raging || b.played.fill !== '24%') fails.push('BW-7 the bar does not read the instant shown: ' + JSON.stringify(b.played));
      if (!b.normal.quiet) fails.push('BW-7 a normal hunt has a boss bar');
      if (!b.over.quiet) fails.push('BW-7 a finished fight still has a boss bar');
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  return fails;
}

const MUTANTS = [
  { name: 'the first press charges', file: 'src/shell/windows/boss-call-pane.js', from: "if (action === 'call-warn') { sc.warned = true; repaint(); return true; }", to: "if (action === 'call-warn') { run(() => callOut(ctx.account, cs, sc.call.id, sc.quote.price), '', () => ''); return true; }", want: /BW-2/ },
  { name: 'the press sends the data\'s fee, not the server\'s', file: 'src/shell/windows/boss-call-pane.js', from: 'run(() => callOut(ctx.account, cs, call.id, quote.price),', to: 'run(() => callOut(ctx.account, cs, call.id, call.fee),', want: /BW-3/ },
  { name: 'the press is on with no quote', file: 'src/shell/windows/boss-call-pane.js', from: 'const open = !!q && q.available && !v.now && !v.pending;', to: 'const open = !v.now && !v.pending;', want: /BW-1|BW-4/ },
  { name: 'a moved price is not read back', file: 'src/shell/windows/boss-call-pane.js', from: '.then((r) => { if (r && r.quote) sc.quote = r.quote; else sc.at = 0; repaint(); });', to: '.then(() => { repaint(); });', want: /BW-3/ },
  { name: 'every repaint asks again', file: 'src/shell/windows/boss-call-pane.js', from: 'if (!sc.asking && !v.now && now - sc.at > QUOTE_STANDS_MS) {', to: 'if (!sc.asking && !v.now && (!sc.quote || now - sc.at > QUOTE_STANDS_MS)) {', want: /BW-4/ },
  { name: 'a won fight gets a losing line', file: 'src/hunt-view/boss-loss.js', from: '|| !LOST.includes(o.reason)) return null;', to: ') return null;', want: /BW-6/ },
  { name: 'the line reads the wrong phase', file: 'src/hunt-view/boss-loss.js', from: "return bossPm <= ph.enragePm ? 'enrage' : bossPm <= ph.addsPm ? 'adds' : 'first';", to: "return bossPm <= ph.addsPm ? 'adds' : 'first';", want: /BW-6/ },
  { name: 'a shielded boss\'s wave reads the plain answer', file: 'src/hunt-view/boss-loss.js', from: "phase === 'adds' && isGuarded(MONSTERS[call.monster]) ? W.answer.guarded : W.answer[phase];", to: 'W.answer[phase];', want: /BW-6/ },
  { name: 'the tank is asked about his food', file: 'src/hunt-view/boss-loss.js', from: "if (phase === 'adds' && role === 'tank') return", to: "if (phase === 'adds' && role === 'nobody') return", want: /BW-6/ },
  { name: 'a mark in the wrong place', file: 'src/shell/widgets/boss-bar.js', from: "'left', (ph.enragePm / 10) + '%'", to: "'left', (ph.addsPm / 10) + '%'", want: /BW-7/ },
  { name: 'the bar reads the snapshot, not the instant shown', file: 'src/shell/widgets/boss-bar.js', from: 'const hp = played ? played.hp : x.hp, max = played ? played.maxHp : x.hpMax;', to: 'const hp = x.hp, max = x.hpMax;', want: /BW-7/ },
  { name: 'the bar stands on every hunt', file: 'src/shell/widgets/boss-bar.js', from: "cls(el, 'is-quiet', !ph);", to: "cls(el, 'is-quiet', false);", want: /BW-7/ },
  { name: 'a free way back from the room', file: 'src/hunt-view/summary-model.js', from: ' || callOfHunt(summary.hunt)) return null;', to: ') return null;', want: /BW-5/ },
];

async function main() {
  if (process.argv.includes('--mutate') || process.argv.includes('--selftest')) {
    if (process.env.HR_MUTANT_CONTROL) { const f = await checks(); console.log('boss-call-window --mutate: control ran the clean tree: ' + (f.join('; ') || 'green')); process.exit(0); }
    let escaped = 0;
    for (const m of MUTANTS) {
      const src = (await readFile(join(ROOT, m.file), 'utf8'));
      if (src.split(m.from).length !== 2) throw new Error('anchor: ' + m.name);
      let got;
      try { got = await checks({ [m.file]: src.replace(m.from, () => m.to) }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 160)]; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + String(got[0] || 'every rule held').slice(0, 130));
    }
    console.log(escaped ? `boss-call-window --mutate: ${escaped} ESCAPED` : `boss-call-window --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
    process.exit(escaped ? 1 : 0);
  }
  const fails = await checks();
  for (const f of fails) console.log('FAIL  ' + f);
  console.log(fails.length ? 'boss-call-window: ' + fails.length + ' FAILED' : 'boss-call-window: green (the server\'s words, the warning, one press, a moved price, no hammer, no free way back)');
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
