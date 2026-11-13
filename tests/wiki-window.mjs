#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/wiki-window.mjs — THE WIKI IS WRITTEN BY THE GAME, AND ITS FORMULAS ARE THE ENGINE'S (work ledger item 9).
//
//   node tests/wiki-window.mjs                  the rules
//   node tests/wiki-window.mjs --mutate         every planted defect must turn a rule RED
//   node tests/wiki-window.mjs --shots <dir>    also write the desktop and phone screenshots
//
// mutant-anchors: src/data/settings.js src/core/combat.js src/core/action-rules.js src/core/xp.js src/shell/wiki-model.js src/shell/windows/wiki.js
//
// play.html with supabase-js and the REST paths stubbed (tests/_client-harness.mjs); the hero is
// tests/fixtures/alpha-envelope.json in town.
//   WK-1  (no browser) every skill row, every open ground and the seven formulas have a page, and each formula's worked
//         example equals the arithmetic of the terms it states, done HERE by hand (never through the engine)
//   WK-2  the slash opens the Wiki with zero console errors; the search finds a skill (Melee), a ground (the first open one)
//         and a formula (Your max hit) and hides what does not match; nonsense finds nothing and says so; a tab shows its section
//   WK-3  THE GUARD, in the page: every Formulas example the player reads carries its stated terms and the engine's answer
//         (computed in the page by the engine's own function), and the answer equals the stated terms' arithmetic and is the
//         number the sentence says. A constant changed in the engine but not in the words (or the reverse) is red.
//   WK-4  the phone (922x423): Settings, Help opens it (the way in on every screen: no top-bar icon), the wiki is a sheet, nothing overflows sideways and no text is under 12 px
// ════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { leaseBrowser } from './_chrome.mjs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, serve, SDK_STUB } from './_client-harness.mjs';
import { pinFonts } from './_test-fonts.mjs';

const src = (p) => import(pathToFileURL(join(ROOT, p)).href);
const { SKILLS_DEF } = await src('src/data/skills.js');
const { OPEN_GROUNDS } = await src('src/data/hunt-grounds.js');
const { HUNT_INDEX } = await src('src/data/hunts.js');
const { whole } = await src('src/render/format.js');

const FORMULAS = ['hit', 'max', 'mon_hit', 'mon_max', 'level_curve', 'skill_xp', 'death'];
const clampTo = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* THE ARITHMETIC OF EACH RULE, from the terms the page states, typed here so the engine is never asked. Returns the
   numbers the example must show: { result, blessed? }. */
function byHand(id, T, I) {
  switch (id) {
    case 'hit': {
      const defScore = I.def * (T.defMul[I.tier] || 1);
      let a = T.base + ((I.level + I.accuracy) - defScore) * T.per;
      if (I.weak) a *= T.weak;
      return { result: clampTo(a, T.min, T.max) };
    }
    case 'max': {
      let m = Math.floor(I.level * T.lvl + I.strength * T.str + T.flat);
      m = Math.max(1, m - Math.floor(I.defScore * T.cut));
      return { result: Math.max(1, Math.floor(m * (I.weak ? T.weak : 1))) };
    }
    case 'mon_hit': return { result: clampTo((I.baseAcc === null ? T.base : I.baseAcc) + (I.atk - I.defense) * T.per, T.min, T.max) };
    case 'mon_max': return { result: Math.max(1, Math.floor(I.atk * (T.byTier[I.tier] || T.scale))) };
    case 'level_curve': {
      let total = 0;
      for (let n = 1; n < I.level; n++) {
        const r = T.rows.filter((x) => x.from <= n).pop(), k = n - r.from;
        total += r.first + r.rise * k + r.bend * k * k;
      }
      return { result: total };
    }
    case 'skill_xp': {
      let total = 0n;
      for (let s = 1n; s < BigInt(I.level); s++) total += (BigInt(T.base) * s * s * BigInt(1000 + T.growthPermille) ** (s - 1n)) / 1000n ** (s - 1n);
      return { result: Number(total) };
    }
    case 'death': return { result: Math.floor(I.xp * T.share), blessed: Math.floor(I.xp * (T.share * (1000 - I.cut) / 1000)) };
    default: return null;
  }
}
/* The number the sentence must say: a share in percent to one decimal, else a whole number as the game writes it. */
const said = (id, v) => (id === 'hit' || id === 'mon_hit' ? Math.round(v * 1000) / 10 + '%' : whole(v));
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9;

/** WK-1/WK-3's check of one example: [] when it agrees. */
export function checkExample(rule, c, words) {
  const want = byHand(c.id, c.terms, c.inputs);
  if (!want) return [rule + ' ' + c.id + ' is a formula the guard does not know'];
  const out = [];
  if (!near(c.result, want.result)) out.push(rule + ' ' + c.id + ': the engine says ' + c.result + ', its stated terms make ' + want.result);
  if ('blessed' in want && !near(c.blessed, want.blessed)) out.push(rule + ' ' + c.id + ' with a Blessing: the engine says ' + c.blessed + ', its stated terms make ' + want.blessed);
  if (words !== undefined && !words.includes(said(c.id, c.result))) out.push(rule + ' ' + c.id + '\'s example does not say ' + said(c.id, c.result) + ': ' + JSON.stringify(words));
  return out;
}

const BASE_ENV = JSON.parse(await readFile(join(ROOT, 'tests/fixtures/alpha-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const TOWN = { hunt: null, state: Object.assign(clone(BASE_ENV.state), { active_kind: 'idle', active_id: null }) };
const wait = (page, fn, arg, ms = 20000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false);
const W = '.hs-win[data-hs-win="wiki"]';

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

/* The pages showing now, as "section:id". */
/* Its two doors: the slash, and Settings' Help row (the phone's way in: the top bar has no room for an icon). */
async function openWiki(page, how) {
  if (how === 'key') await page.keyboard.press('/');
  else {
    await page.keyboard.press('Escape');
    await wait(page, () => document.querySelector('.st-tab[data-cat="help"]'), null, 8000);
    await page.click('.st-tab[data-cat="help"]');
    await page.click('[data-row="help.wiki"] [data-hs-act="run"]');
  }
  return wait(page, (w) => document.querySelector(w + ' .wk-page'), W, 8000);
}
const shownPages = (page) => page.evaluate((w) => Array.from(document.querySelectorAll(w + ' .wk-page')).filter((p) => p.getClientRects().length > 0)
  .map((p) => p.getAttribute('data-wk-sec') + ':' + p.getAttribute('data-wk-id')), W);
async function search(page, q) {
  await page.fill(W + ' .hw-q', q);
  await page.waitForTimeout(150);
  return shownPages(page);
}

async function checks(overrides, shots) {
  const fails = [];
  if (!overrides) { // WK-1
    const { skillPages, groundPages, formulaPages } = await src('src/shell/wiki-model.js');
    const skills = skillPages().map((s) => s.id), grounds = groundPages().map((g) => g.id), formulas = formulaPages();
    for (const id of ['level', ...Object.keys(SKILLS_DEF)]) if (!skills.includes(id)) fails.push('WK-1 the skill ' + id + ' has no page');
    for (const g of Object.values(OPEN_GROUNDS)) if (!grounds.includes(g.hunt)) fails.push('WK-1 the open ground ' + g.hunt + ' has no page');
    if (formulas.map((f) => f.id).join() !== FORMULAS.join()) fails.push('WK-1 the formulas are ' + formulas.map((f) => f.id).join() + ', not ' + FORMULAS.join());
    for (const f of formulas) fails.push(...checkExample('WK-1', Object.assign({ id: f.id, terms: f.terms, inputs: f.example.inputs, result: f.example.result, blessed: f.example.blessed })));
  }
  const firstGround = Object.values(OPEN_GROUNDS).map((g) => HUNT_INDEX[g.hunt]).sort((a, b) => a.band[0] - b.band[0])[0];
  const { server, port } = await serve(overrides);
  const browser = await leaseBrowser(chromium);
  const open = async (viewport, touch) => {
    const ctx = await browser.newContext({ viewport, hasTouch: !!touch, isMobile: false });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    await stub(page, { env: Object.assign(clone(BASE_ENV), clone(TOWN)), version: 1 });
    const up = await signInAndPlay(page, 'http://127.0.0.1:' + port);
    return { ctx, page, errors, up };
  };
  try {
    { // WK-2, WK-3
      const { ctx, page, errors, up } = await open({ width: 1440, height: 900 });
      if (!up) fails.push('WK-2 the World never came up');
      else if (!(await openWiki(page, 'key'))) fails.push('WK-2 the slash did not open the Wiki');
      else {
        const first = await shownPages(page);
        if (!first.length || !first.every((p) => p.startsWith('skills:'))) fails.push('WK-2 the Wiki opens on ' + JSON.stringify(first.slice(0, 3)) + ', not the Skills');
        if (shots) { await page.waitForTimeout(300); await page.screenshot({ path: join(shots, 'wiki-desktop-1440x900.png') }); }
        const melee = await search(page, 'melee');
        if (!melee.includes('skills:melee') || melee.includes('skills:fishing')) fails.push('WK-2 searching "melee" shows ' + JSON.stringify(melee));
        const ground = await search(page, firstGround.name);
        if (!ground.includes('grounds:' + firstGround.id)) fails.push('WK-2 searching "' + firstGround.name + '" shows ' + JSON.stringify(ground));
        const max = await search(page, 'your max hit');
        if (!max.includes('formulas:max') || max.some((p) => p.startsWith('skills:'))) fails.push('WK-2 searching "your max hit" shows ' + JSON.stringify(max));
        if (shots) { await page.waitForTimeout(200); await page.screenshot({ path: join(shots, 'wiki-desktop-search-1440x900.png') }); }
        const nothing = await search(page, 'zzqx');
        const none = await page.evaluate((w) => { const n = document.querySelector(w + ' .wk-none'); return n && !n.hidden ? n.textContent : ''; }, W);
        if (nothing.length || !none.includes('zzqx')) fails.push('WK-2 a search for nonsense shows ' + JSON.stringify(nothing) + ' and says ' + JSON.stringify(none));
        await search(page, '');
        await page.click(W + ' .hw-tab[data-tab="formulas"]');
        await page.waitForTimeout(150);
        const forms = await shownPages(page);
        if (forms.join() !== FORMULAS.map((f) => 'formulas:' + f).join()) fails.push('WK-2 the Formulas tab shows ' + JSON.stringify(forms));
        if (shots) { await page.waitForTimeout(200); await page.screenshot({ path: join(shots, 'wiki-desktop-formulas-1440x900.png') }); }
        // WK-3
        const examples = await page.evaluate((w) => Array.from(document.querySelectorAll(w + ' [data-wk-formula]'))
          .map((e) => Object.assign({ id: e.getAttribute('data-wk-formula'), words: e.textContent }, JSON.parse(e.getAttribute('data-wk-check')))), W);
        if (examples.map((e) => e.id).join() !== FORMULAS.join()) fails.push('WK-3 the page works the examples ' + JSON.stringify(examples.map((e) => e.id)));
        for (const e of examples) fails.push(...checkExample('WK-3', e, e.words));
      }
      if (errors.length) fails.push('WK-2 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
    { // WK-4
      const { ctx, page, errors, up } = await open({ width: 922, height: 423 }, true);
      if (!up || !(await openWiki(page, 'help'))) fails.push('WK-4 Settings, Help did not open the Wiki on the phone');
      else {
        await page.waitForTimeout(600);
        const m = await page.evaluate((w) => {
          const el = document.querySelector(w), body = el.querySelector('[data-hs-body]');
          let small = null;
          for (const e of el.querySelectorAll('*')) {
            if (!e.childNodes.length || ![...e.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
            const fs = parseFloat(getComputedStyle(e).fontSize);
            if (e.getClientRects().length && fs < 12 && (!small || fs < small.fs)) small = { fs, text: e.textContent.trim().slice(0, 30) };
          }
          return { right: Math.round(el.getBoundingClientRect().right), over: body.scrollWidth - body.clientWidth, small, vw: innerWidth };
        }, W);
        if (m.right > m.vw || m.over > 1) fails.push('WK-4 the phone sheet is ' + JSON.stringify(m));
        if (m.small) fails.push('WK-4 text under 12 px on the phone: ' + JSON.stringify(m.small));
        if (shots) await page.screenshot({ path: join(shots, 'wiki-phone-922x423.png') });
        await page.click(W + ' .hw-tab[data-tab="formulas"]');
        await page.waitForTimeout(200);
        const o = await page.evaluate((w) => { const b = document.querySelector(w + ' [data-hs-body]'); return b.scrollWidth - b.clientWidth; }, W);
        if (o > 1) fails.push('WK-4 the Formulas overflow the phone sheet by ' + o + ' px');
        if (shots) await page.screenshot({ path: join(shots, 'wiki-phone-formulas-922x423.png') });
      }
      if (errors.length) fails.push('WK-4 console errors: ' + errors.slice(0, 3).join(' | '));
      await ctx.close();
    }
  } finally {
    server.close();
  }
  return fails;
}

/* Each plants one defect the rules above exist for. [name, file, from, to] */
const MUTANTS = [
  ['the engine\'s base chance to hit moves and the words do not', 'src/core/combat.js', '  let accuracy = 0.55 + (', '  let accuracy = 0.6 + ('],
  ['the engine\'s max hit per Level moves and the words do not', 'src/core/combat.js', '(dmgLvl * 0.35)', '(dmgLvl * 0.4)'],
  ['a monster\'s chance to hit grows faster than the words say', 'src/core/combat.js', ' - playerDefense) * b.monsterAccuracyPerPoint),', ' - playerDefense) * b.monsterAccuracyPerPoint * 1.5),'],
  ['a monster\'s max hit gains a point the words never mention', 'src/core/combat.js', '  return Math.max(1, Math.floor(((monster && monster.atk) || 1) * scale));', '  return Math.max(1, Math.floor(((monster && monster.atk) || 1) * scale) + 1);'],
  ['a death takes more than its stated share', 'src/core/action-rules.js', '  return Math.max(0, Math.min(Math.floor(x * f), x));', '  return Math.max(0, Math.min(Math.floor(x * f * 1.1), x));'],
  ['the Level curve\'s step grows faster than its table says', 'src/core/xp.js', '+ r.rise * sumK(m) + r.bend * sumK2(m);', '+ r.rise * sumK(m) + r.bend * sumK2(m + 1);'],
  ['a combat skill Level costs a point more than the rule says', 'src/core/xp.js', '    const step = Number((base * sl * sl * powNum) / powDen);', '    const step = Number((base * sl * sl * powNum) / powDen) + 1;'],
  ['the wiki states a base chance the engine does not use', 'src/shell/wiki-model.js', 'terms: { base: B.playerBaseAccuracy,', 'terms: { base: B.playerBaseAccuracy + 0.05,'],
  ['Settings, Help has no door to the Wiki', 'src/data/settings.js', "  type: 'action', open: 'wiki',", "  type: 'action', open: 'report',"],
  ['the search never finds a page', 'src/shell/windows/wiki.js', 'const on = q ? findText(p).includes(q) :', 'const on = q ? false :'],
  ['an example\'s sentence drops its answer', 'src/shell/windows/wiki.js', "example: t('wiki.max_example', { level: I.level, monster: I.monster, result: r }) };", "example: t('wiki.max_example', { level: I.level, monster: I.monster, result: '?' }) };"],
];

async function main() {
  const at = process.argv.indexOf('--shots');
  const shots = at > 0 ? resolve(process.argv[at + 1] || 'wiki-shots') : null;
  if (shots) await mkdir(shots, { recursive: true });
  if (!process.argv.includes('--mutate')) {
    const fails = await checks(null, shots);
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'wiki-window: ' + fails.length + ' rule(s) RED'
      : 'wiki-window: every skill, open ground and formula has a page; the slash opens it; the search finds a skill, a ground and a formula; every worked example is the engine\'s answer and equals its stated terms; a sheet on the phone');
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
  console.log(bad ? 'wiki-window --mutate: ' + bad + ' escaped' : 'wiki-window --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}

main();
