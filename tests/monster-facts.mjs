#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/monster-facts.mjs — A MONSTER'S PAGE SAYS WHAT ITS DATA ROW SAYS, IN A REAL CHROMIUM (lane/b-monster-facts).
//
//   node tests/monster-facts.mjs            the rules
//   node tests/monster-facts.mjs --mutate   every planted defect must turn a rule RED
//   node tests/monster-facts.mjs --shots <dir>   also write the desktop and phone screenshots
//
// mutant-anchors: src/shell/monster-facts.js src/shell/windows/monster.js src/shell/windows/hunt-detail.js src/data/text/monster.js
//
// Tyler 2026-11-09: every monster's stats are visible in the game. play.html with supabase-js and the REST
// paths stubbed (tests/_client-harness.mjs); the hero is tests/fixtures/alpha-envelope.json ("Tyler", slot 0)
// in town, in no party. What the page must read is worked out HERE from the raw rows (src/data/monsters.js)
// and the engine's own constants with plain arithmetic, never through src/shell/monster-facts.js.
//   MF-1  a creature on a hunt's page opens its page with zero console errors, and the Hunts window stays open
//   MF-2  the Briarcoat Wolf's page equals its row: name, family and Level, Health and what a kill pays (the row's own,
//         the same for every group size: Tyler 2026-11-08), its biggest hit labelled exactly "Max Hit" with that one number (Tyler
//         2026-11-11: "it should just say Max Hit"), the one attack interval, its weakness and elements, every
//         drop in the row's order with its chance per kill, and the ground it lives on. Every stat is labelled with the game's
//         own word and nothing more (the approved wiki mock, 11-11): Tier (Normal), Health, Max Hit, Attack Speed (in seconds),
//         Damage Type, Weak to, Elements. Under them, what each harder tier changes on the ground the page was opened from,
//         its Health and damage percentages equal to that ground's tier dials (hunt-tiers.js GROUND_TIERS, the engine's rows;
//         Tyler 2026-11-11), and nothing on a Normal-only ground (the Cellar). No heading carries a line that explains how
//         the game works ("shared by the heroes who were there", "In a party, each drop goes to one hero": Tyler 2026-11-11)
//   MF-3  the creature's name is a real button: focus and Enter open the page (Enter is not taken for Chat)
//   MF-4  a drop says what it is for, and a use that a window does is a link that opens that window
//   MF-5  the Slime's drops carry its own drop bonus, and the Sump Slime's Rares read the same chance as on the Hunts
//         page; the Rat King reads his row's numbers and carries the Hunts list's own group warning, never a gate
//   MF-6  the phone (922x423): the page is a sheet no wider than 400 px, nothing overflows sideways, no text is
//         under 12 px, and a ground's link goes back to that ground's Hunts page
//   MF-7  (no browser) every monster on an open ground has a page, and every word its row can ask for exists; on each of
//         its grounds its harder tiers are that ground's dials, and every dial raises a number (a tier that lowered one
//         would go unsaid)
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const src = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { MONSTERS } = await src('src/data/monsters.js');
const { ITEMS } = await src('src/data/items.js');
const { OPEN_GROUNDS } = await src('src/data/hunt-grounds.js');
const { HUNT_INDEX } = await src('src/data/hunts.js');
const { COMBAT_BALANCE, WEAKNESS_BONUS } = await src('src/core/combat.js');
const { ELEMENTS } = await src('src/data/elements.js');
const { chance, whole } = await src('src/render/format.js');
const { t, hasText } = await src('src/render/player-text.js');
const { LOOT_BANDS } = await src('src/data/loot-bands.js');
const { GROUND_TIERS, TIER_NAME } = await src('src/data/hunt-tiers.js');

/* WHAT EACH HARDER TIER CHANGES on the ground `hunt`, from that ground's dials (the engine's own rows) by plain arithmetic: Health
   in percent more, damage in percent harder, or from twice as hard up in times as hard to one decimal. '' on a Normal-only ground. */
function tierLine(hunt) {
  const g = Object.values(OPEN_GROUNDS).find((x) => x.hunt === hunt);
  const dials = (g && GROUND_TIERS[g.id]) || {};
  return ['dangerous', 'deadly'].filter((k) => dials[k]).map((k) => {
    const hp = Math.round((dials[k].hpPm / 1000 - 1) * 100), x = dials[k].dmgPm / 1000;
    const hits = x <= 1 ? '' : x >= 2 ? t('monster.hits_times', { times: Math.round(x * 10) / 10 }) : t('monster.hits_pct', { pct: Math.round((x - 1) * 100) });
    const tier = TIER_NAME[k];
    return hp > 0 && hits ? t('monster.tier_both', { tier, hp, hits }) : hits ? t('monster.tier_hits', { tier, hits }) : t('monster.tier_hp', { tier, hp });
  }).join(' ');
}

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
/* Generous ceilings: a green run never waits on them, and a loaded machine takes several seconds to load the page. */
const wait = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const W = '[data-hs-win="monster"]';

/* WHAT THE PAGE MUST READ for monster `id` on `hunt`: plain arithmetic on the raw row, the same for every group size. */
function expected(id, hunt) {
  const row = MONSTERS[id];
  const scale = COMBAT_BALANCE.monsterDamageScaleByTier[row.tier] || COMBAT_BALANCE.monsterAttackDamageScale;
  const gp = row.gp;
  const els = ELEMENTS.filter((e) => row.elements && row.elements[e]).map((e) => t(row.elements[e] > 0 ? 'monster.el_less' : 'monster.el_more',
    { pct: Math.abs(row.elements[e]), element: t('monster.el_' + e) }));
  return {
    name: row.name,
    kind: t(row.boss ? 'monster.kind_boss' : 'monster.kind', { family: row.className, level: row.level }),
    hp: whole(row.hp),
    maxHit: whole(Math.max(1, Math.floor(row.atk * scale))),
    /* Tyler's word, typed here and never read through t(): a text home that drifts from it is red. */
    maxHitLabel: 'Max Hit',
    /* The rest of the stat labels, the approved wiki mock's (11-11), typed here the same way: "It attacks" or "Its damage" is red. */
    labels: ['tier', 'Tier', 'hp', 'Health', 'swing', 'Attack Speed', 'deals', 'Damage Type', 'weak', 'Weak to', 'takes', 'Elements'].join(' / '),
    /* The numbers are Normal's, the same alone or in a party (Tyler 2026-11-08), and the page says which tier. */
    tier: 'Normal',
    swing: COMBAT_BALANCE.tickMs / 1000 + ' s',
    weak: t('monster.weak_' + row.weaponWeak, { pct: Math.round((WEAKNESS_BONUS.damage - 1) * 100), acc: Math.round((WEAKNESS_BONUS.accuracy - 1) * 100) }),
    takes: els.length ? (els.length > 1 ? els.slice(0, -1).join(', ') + ' and ' + els.at(-1) : els[0]) : t('monster.takes_all'),
    xp: whole(row.xp),
    gold: gp[0] === gp[1] ? t('monster.gold_one', { lo: whole(gp[0]) }) : t('monster.gold_value', { lo: whole(gp[0]), hi: whole(gp[1]) }),
    drops: row.drops.map((d) => [d.id, ITEMS[d.id].n, t('monster.band_' + d.band), chance(d.ch >= 1 ? 1 : Math.min(0.95, d.ch * (row.dropBonus || 1)))].join(' / ')),
    home: HUNT_INDEX[hunt].name,
    tiers: tierLine(hunt),
  };
}

async function stub(page, s) {
  await page.route('**/src/vendor/supabase-js-*.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: SDK_STUB }));
  await pinFonts(page);
  await page.route('https://nezapsylztqbbwuwembx.supabase.co/**', async (r) => {
    const name = r.request().url().split('?')[0].split('/').pop();
    const json = (b) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(b) });
    if (name === 'hr_load' || name === 'hr-accrue') return json(Object.assign(clone(s.env), { version: ++s.version, ok: true }));
    return json({ ok: true });
  });
}

async function signInAndPlay(page, base) {
  await page.goto(base + '/play.html', { waitUntil: 'load', timeout: 45000 });
  await wait(page, () => document.querySelector('form[data-auth="sign-in"]'));
  await page.fill('input[name=email]', 'qa@example.test');
  await page.fill('input[name=password]', 'not-a-real-password');
  await page.click('.auth-submit');
  await wait(page, () => document.querySelector('[data-app="play"][data-slot="0"]'));
  await page.click('[data-app="play"][data-slot="0"]');
  return wait(page, () => document.querySelector('.hs-launchers'));
}

const readPage = (page) => page.evaluate((w) => {
  const el = document.querySelector(w);
  if (!el || !el.querySelector('.mf-page') || el.querySelector('.mf-page').hidden) return null;
  const fact = (k) => { const d = el.querySelector('[data-fact="' + k + '"]'); return d.parentElement.hidden ? null : d.textContent; };
  const label = (k) => { const d = el.querySelector('[data-fact="' + k + '"]'); return d ? d.parentElement.querySelector('dt').textContent : null; };
  return { id: el.querySelector('.mf').getAttribute('data-monster'), name: el.querySelector('.mf-name').textContent, kind: el.querySelector('.mf-kind').textContent,
    hp: fact('hp'), maxHit: fact('max_hit'), maxHitLabel: label('max_hit'), swing: fact('swing'), deals: fact('deals'), weak: fact('weak'), takes: fact('takes'), xp: fact('xp'), gold: fact('gold'),
    labels: ['tier', 'hp', 'swing', 'deals', 'weak', 'takes'].flatMap((k) => [k, label(k)]).join(' / '), tier: fact('tier'),
    fight: el.querySelector('.mf-facts').previousElementSibling.textContent, kill: el.querySelectorAll('.mf-facts')[1].previousElementSibling.textContent,
    per: el.querySelector('.mf-per').textContent, tiers: el.querySelector('.mf-tiers').textContent,
    drops: Array.from(el.querySelectorAll('.mf-drop')).map((li) => [li.dataset.item, li.querySelector('.mf-drop-name').textContent, li.querySelector('.mf-drop-band').textContent, li.querySelector('.mf-odds').textContent].join(' / ')),
    uses: Object.fromEntries(Array.from(el.querySelectorAll('.mf-drop')).map((li) => [li.dataset.item, li.querySelector('.mf-drop-use').textContent])),
    homes: Array.from(el.querySelectorAll('.mf-home')).map((li) => ({ name: li.querySelector('.mf-home-go').textContent, how: li.querySelector('.mf-home-how').textContent, warn: li.querySelector('.mf-home-party').textContent })),
    drawn: !!el.querySelector('.mf-stand.is-drawn') };
}, W);

/* Open Hunts on `hunt` and press creature `id` on its page; true once that monster's page is drawn. */
async function openFacts(page, hunt, id, how) {
  if (!(await page.evaluate(() => !!document.querySelector('[data-hs-win="hunts"]')))) await page.keyboard.press('h');
  /* a monster opened from Hunts is a page of it (lane/b-window-header): its header's Back returns to the list */
  if (await page.evaluate(() => !!document.querySelector('.hs-win[data-hs-win="hunts"].has-page'))) await page.click('.hs-win[data-hs-win="hunts"] > .hs-win-head .hs-back');
  await wait(page, (h) => document.querySelector('[data-hs-win="hunts"] .hw-hunt[data-hunt="' + h + '"]'), hunt);
  await page.click('[data-hs-win="hunts"] .hw-hunt[data-hunt="' + hunt + '"]');
  const mon = '[data-hs-win="hunts"] .hw-hd-mon[data-monster="' + id + '"]';
  await wait(page, (m) => { const li = document.querySelector(m); return li && li.getClientRects().length > 0; }, mon);
  if (how === 'key') { await page.focus(mon + ' button'); await page.keyboard.press('Enter'); }
  else await page.click(mon + ' .hw-hd-stand');
  return wait(page, (a) => { const el = document.querySelector(a[0] + ' .mf'); return el && el.getAttribute('data-monster') === a[1] && el.querySelector('.mf-name').textContent; }, [W, id], 8000);
}

function compare(fails, rule, got, want) {
  if (!got) { fails.push(rule + ' the page was not drawn'); return; }
  for (const k of ['name', 'kind', 'hp', 'maxHit', 'maxHitLabel', 'labels', 'tier', 'swing', 'weak', 'takes', 'tiers', 'xp', 'gold']) if (got[k] !== want[k]) fails.push(rule + ' ' + k + ' reads ' + JSON.stringify(got[k]) + ', the row says ' + JSON.stringify(want[k]));
  if (got.drops.join(' | ') !== want.drops.join(' | ')) fails.push(rule + ' the drops read ' + JSON.stringify(got.drops) + ', the row says ' + JSON.stringify(want.drops));
  if (!got.homes.some((h) => h.name === want.home)) fails.push(rule + ' its grounds read ' + JSON.stringify(got.homes) + ', not ' + want.home);
}

async function checks(overrides, shots) {
  const fails = [];
  // ── MF-7 (no browser): every monster a player can meet has a page, and every word its row asks for exists ──
  if (!overrides) {
    const { monsterFactsOf } = await src('src/shell/monster-facts.js');
    const met = new Set();
    for (const g of Object.values(OPEN_GROUNDS)) for (const p of g.pockets) for (const s of (p.pack || []).concat(p.spawns)) met.add(s.monster);
    for (const id of met) {
      const f = monsterFactsOf(id);
      if (!f) { fails.push('MF-7 ' + id + ' stands on an open ground and has no page'); continue; }
      const words = ['monster.weak_' + MONSTERS[id].weaponWeak, 'monster.el_' + f.deals, ...f.elements.map((e) => 'monster.el_' + e.element), ...f.drops.map((d) => 'monster.band_' + d.band), ...f.homes.map((h) => 'monster.how_' + h.how)];
      for (const w of words) if (!hasText(w)) fails.push('MF-7 ' + id + ' asks for the word ' + w + ', which the text home does not have');
      if (!(f.hp >= 1) || !(Number.isInteger(f.maxHit) && f.maxHit >= 1) || !f.homes.length || f.drops.some((d) => !(d.chance > 0 && d.chance <= 1) || !d.uses.length)) fails.push('MF-7 ' + id + ' has a fact that is not a fact: ' + JSON.stringify({ hp: f.hp, maxHit: f.maxHit }));
      /* opened from each of its grounds, its harder tiers are THAT ground's dials (the engine's rows), and each raises a number */
      for (const h of f.homes) {
        const mine = monsterFactsOf(id, h.hunt).tiers, dials = GROUND_TIERS[h.ground.id] || {};
        const want = Object.keys(dials).map((k) => ({ tier: k, hpPm: dials[k].hpPm, dmgPm: dials[k].dmgPm }));
        if (JSON.stringify(mine) !== JSON.stringify(want)) fails.push('MF-7 ' + id + ' opened from ' + h.hunt + ' states the tiers ' + JSON.stringify(mine) + ', the ground\'s dials are ' + JSON.stringify(want));
        for (const x of mine) if (x.hpPm < 1000 || x.dmgPm < 1000 || (x.hpPm === 1000 && x.dmgPm === 1000)) fails.push('MF-7 ' + h.hunt + '\'s ' + x.tier + ' lowers a number or raises none, and the page has no words for that: ' + JSON.stringify(x));
      }
    }
    for (const b of LOOT_BANDS) if (!hasText('monster.band_' + b)) fails.push('MF-7 the band ' + b + ' has no word');
  }

  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (viewport, touch) => {
    const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    const s = { env: Object.assign(clone(BASE_ENV), clone(TOWN)), version: 1 };
    await stub(page, s);
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, up };
  };
  try {
    { // MF-1, MF-2, MF-3, MF-4, MF-5
      const { ctx, page, errors, up } = await open({ width: 1440, height: 900 });
      if (!up) fails.push('MF-1 the World never came up');
      const opened = await openFacts(page, 'meadowbrook_thicket', 'briarcoat_wolf');
      if (!opened) fails.push('MF-1 pressing the Briarcoat Wolf on the Thicket\'s page did not open its page');
      else {
        if (!(await page.evaluate(() => !!document.querySelector('[data-hs-win="hunts"] .hw-hd-lineup')))) fails.push('MF-1 opening the page closed the Hunts window');
        await wait(page, (w) => document.querySelector(w + ' .mf-stand.is-drawn'), W, 6000);
        const got = await readPage(page);
        const want = expected('briarcoat_wolf', 'meadowbrook_thicket');
        compare(fails, 'MF-2', got, want);
        if (got && !got.drawn) fails.push('MF-2 the creature was not drawn');
        /* Each heading is the heading alone (Tyler 2026-11-11: a line that explains how the game works is cut): which tier is the Tier
           row's to say, a kill's heading carries no "shared by the heroes who were there", and the drops' note is the column's "Chance per
           kill" with no party rule after it. */
        const said = got ? [got.fight, got.tier, got.kill, got.per].join(' | ') : '';
        if (got && (got.fight !== t('monster.h_fight') || got.kill !== t('monster.h_kill') || got.per !== 'Chance per kill' || /party|alone|shared|heroes who|each drop goes/i.test(said))) fails.push('MF-2 the page\'s headings read ' + JSON.stringify(said));
        /* The Thicket offers harder tiers: its line is there, and it says the ground's own numbers (compare, above). */
        if (got && !got.tiers) fails.push('MF-2 the Briarcoat Wolf\'s page says nothing of the Thicket\'s harder tiers');
        /* Its creature's link names the ground it stands on, so a monster on two grounds states the tiers of the one it was opened from. */
        const linkTo = await page.evaluate(() => (document.querySelector('[data-hs-win="hunts"] .hw-hd-mon[data-monster="briarcoat_wolf"]') || { getAttribute: () => null }).getAttribute('data-hs-goto'));
        if (linkTo !== 'monster|briarcoat_wolf|meadowbrook_thicket') fails.push('MF-2 the Briarcoat Wolf\'s link does not name its ground: ' + JSON.stringify(linkTo));
        if (got && got.deals !== t('monster.el_physical')) fails.push('MF-2 its damage reads ' + got.deals);
        if (shots) {
          await page.waitForTimeout(400);
          await page.screenshot({ path: join(shots, 'monster-facts-desktop-1440x900.png') });
          await page.evaluate((w) => { const b = document.querySelector(w + ' [data-hs-body]'); b.scrollTop = b.scrollHeight; }, W);
          await page.waitForTimeout(300);
          await page.screenshot({ path: join(shots, 'monster-facts-desktop-drops-1440x900.png') });
        }
        /* MF-4: Wolf Pelt is spent at a bench and in the House; its first use opens the bench window */
        const use = got ? got.uses.wolf_pelt || '' : '';
        if (!use || !/\.$/.test(use)) fails.push('MF-4 the Wolf Pelt does not say what it is for: ' + JSON.stringify(use));
        const link = W + ' .mf-drop[data-item="wolf_pelt"] .hs-goto';
        if (!(await page.evaluate((q) => !!document.querySelector(q), link))) fails.push('MF-4 the Wolf Pelt\'s use is not a link');
        else {
          await page.click(link);
          if (!(await wait(page, () => document.querySelector('[data-hs-win="skills-trade"]'), null, 8000))) fails.push('MF-4 the Wolf Pelt\'s use link did not open the bench window');
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      }
      /* MF-3 */
      if (!(await openFacts(page, 'mill_cellar', 'slime', 'key'))) fails.push('MF-3 Enter on the Slime\'s name did not open its page');
      else {
        if (await page.evaluate(() => !!document.querySelector('[data-hs-win="chat"] input:focus, [data-hs-win="chat"] textarea:focus'))) fails.push('MF-3 Enter on a creature\'s name went to Chat');
        compare(fails, 'MF-5', await readPage(page), expected('slime', 'mill_cellar'));
      }
      if (!(await openFacts(page, 'millrace_sewer', 'sump_slime'))) fails.push('MF-5 the Sump Slime\'s page did not open');
      else {
        const slime = await readPage(page);
        compare(fails, 'MF-5', slime, expected('sump_slime', 'millrace_sewer'));
        /* the Hunts page beside it: each Rare's chance per kill of its creature is the same number */
        const hunts = await page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-hs-win="hunts"] .hw-hd-rares .hw-hd-rare')).map((li) => [li.dataset.item + ':' + li.querySelector('.hw-hd-rare-by').textContent, li.querySelector('.hw-hd-odds').textContent])));
        for (const d of MONSTERS.sump_slime.drops.filter((x) => x.band === 'rare')) {
          const mine = slime ? (slime.drops.find((x) => x.startsWith(d.id + ' / ')) || '').split(' / ').pop() : '';
          const theirs = hunts[d.id + ':' + MONSTERS.sump_slime.name];
          if (!mine || mine !== theirs) fails.push('MF-5 the Sump Slime\'s ' + d.id + ' reads ' + mine + ' on its page and ' + theirs + ' on the Hunts page');
        }
      }
      if (!(await openFacts(page, 'millrace_sewer', 'rat_king'))) fails.push('MF-5 the Rat King\'s page did not open');
      else {
        const king = await readPage(page);
        compare(fails, 'MF-5', king, expected('rat_king', 'millrace_sewer'));
        const said = king ? king.homes.map((h) => h.warn).join('') : '';
        if (king && (!/built for a group/.test(said) || /wants a party|party of \d/.test(JSON.stringify(king)))) fails.push('MF-5 the Rat King\'s page does not carry the group warning as a warning: ' + JSON.stringify(king.homes));
      }
      if (errors.length) fails.push('MF-1 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // MF-6
      const { ctx, page, errors } = await open({ width: 922, height: 423 }, true);
      if (!(await openFacts(page, 'meadowbrook_thicket', 'briarcoat_wolf'))) fails.push('MF-6 the phone never drew the page');
      else {
        await wait(page, (w) => document.querySelector(w + ' .mf-stand.is-drawn'), W, 6000);
        await page.waitForTimeout(600);   // the 120 ms slide-in ends
        const m = await page.evaluate((w) => {
          const el = document.querySelector(w), body = el.hasAttribute('data-hs-body') ? el : el.querySelector('[data-hs-body]');   // a page of Hunts is its own body
          let small = null;
          for (const e of el.querySelectorAll('*')) {
            if (!e.childNodes.length || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
            const fs = parseFloat(getComputedStyle(e).fontSize);
            if (e.getClientRects().length && fs < 12 && (!small || fs < small.fs)) small = { fs, text: e.textContent.trim().slice(0, 30) };
          }
          return { width: Math.round(el.getBoundingClientRect().width), right: Math.round(el.getBoundingClientRect().right), over: body.scrollWidth - body.clientWidth, small, vw: innerWidth };
        }, W);
        if (m.width > 400 || m.right > m.vw || m.over > 1) fails.push('MF-6 the phone sheet is ' + JSON.stringify(m));
        if (m.small) fails.push('MF-6 text under 12 px on the phone: ' + JSON.stringify(m.small));
        if (shots) await page.screenshot({ path: join(shots, 'monster-facts-phone-922x423.png') });
        await page.click(W + ' .mf-home .hs-goto');
        const back = await wait(page, (n) => { const h = document.querySelector('[data-hs-win="hunts"] .hw-hd-name'); return h && h.textContent === n && h.getClientRects().length > 0; }, HUNT_INDEX.meadowbrook_thicket.name, 4000);
        if (!back) fails.push('MF-6 the ground\'s link did not go back to its Hunts page');
      }
      if (errors.length) fails.push('MF-6 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally {
    server.close();
  }
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['Health is the monster\'s attack', 'src/shell/monster-facts.js', '    hp: Math.max(1, fights.hp || 1),', '    hp: Math.max(1, fights.atk || 1),'],
  ['Max Hit is the row\'s attack, not the engine\'s largest blow', 'src/shell/monster-facts.js', '  const top = monsterMaxHit(fights);', '  const top = row.atk;'],
  ['the Max Hit row goes back to the words Tyler could not read', 'src/data/text/monster.js', "  max_hit: 'Max Hit',", "  max_hit: 'One hit',"],
  ['the Attack Speed row goes back to a sentence', 'src/data/text/monster.js', "  swing: 'Attack Speed',", "  swing: 'It attacks',"],
  ['the page stops saying which tier its numbers are', 'src/shell/windows/monster.js', "  set('tier', TIER_NAME[DEFAULT_TIER]);", "  set('tier', '');"],
  ['a kill\'s Level XP is cut to a lone hero\'s old share', 'src/shell/monster-facts.js', '    xp: Math.round(fights.xp || 0),', '    xp: Math.round((fights.xp || 0) * 0.55),'],
  ['a drop\'s chance is cut to a lone hero\'s old share', 'src/shell/monster-facts.js', '      chance: effectiveDropChance(d, { dropMult: lone.dropMult }),', '      chance: effectiveDropChance(d, { dropMult: lone.dropMult }) * 0.55,'],
  ['a drop\'s chance forgets the monster\'s own drop bonus', 'src/shell/monster-facts.js', '{ dropMult: lone.dropMult }', '{}'],
  ['a boss built for a group says nothing of it', 'src/shell/monster-facts.js', "warn: grouped ? partyNote(g.hunt) : '' });", "warn: '' });"],
  ['the page writes Health where the Level XP goes', 'src/shell/windows/monster.js', "  set('xp', whole(f.xp));", "  set('xp', whole(f.hp));"],
  ['a use is plain words, never a link', 'src/shell/windows/monster.js', "      patchParts(li.querySelector('.mf-drop-use'), placesParts(d.uses));", "      text(li.querySelector('.mf-drop-use'), d.uses.map((u) => u.words).join('. ') + '.');"],
  ['a creature on a hunt\'s page opens nothing', 'src/shell/windows/hunt-detail.js', "esc(m.id) + '\"' + gotoAttr(factsTarget(m.id, hunt)) + '><span", "esc(m.id) + '\"><span"],
  ['a creature\'s link forgets the ground it stands on', 'src/shell/windows/hunt-detail.js', 'gotoAttr(factsTarget(m.id, hunt))', 'gotoAttr(factsTarget(m.id))'],
  ['the tier line reads the Health dial as the damage dial', 'src/shell/monster-facts.js', '      return { tier, hpPm: dial.hpPm, dmgPm: dial.dmgPm };', '      return { tier, hpPm: dial.hpPm, dmgPm: dial.hpPm };'],
  ['a tier\'s damage multiplier on the page is a step off the ground\'s', 'src/shell/monster-facts.js', '      return { tier, hpPm: dial.hpPm, dmgPm: dial.dmgPm };', '      return { tier, hpPm: dial.hpPm, dmgPm: dial.dmgPm + 100 };'],
  ['"times as hard" is rounded to a whole number', 'src/shell/windows/monster.js', 'Math.round(pm / 100) / 10', 'Math.round(pm / 1000)'],
  ['the drops\' note explains the party rule again', 'src/data/text/monster.js', "  per_kill: 'Chance per kill',", "  per_kill: 'Chance per kill. In a party, each drop goes to one hero.',"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'monster-facts-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'monster-facts: ' + fails.length + ' rule(s) RED'
      : 'monster-facts: a creature opens its page beside Hunts; every number equals its data row; the name is a button; uses link to their windows; the drop bonus reads true and agrees with the Hunts page; a boss built for a group warns and never gates; a sheet on the phone with a way back; every met monster has a page');
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
  console.log(bad ? 'monster-facts --mutate: ' + bad + ' escaped' : 'monster-facts --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
