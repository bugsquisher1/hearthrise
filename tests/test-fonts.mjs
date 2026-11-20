#!/usr/bin/env node
// tests/test-fonts.mjs — ONE FONT ON EVERY MACHINE, OR A GREEN ON WINDOWS SAYS NOTHING OF GITHUB.
//
//   node tests/test-fonts.mjs             the rules
//   node tests/test-fonts.mjs --selftest  every planted defect must turn a rule RED
//
// THE CLASS (lane r-release-gate, 2026-11-04). The last 30 red release runs hold 7 whose only cause, or one cause, was a layout
// rule or a mutant that read differently in GitHub's fallback font: 40629617155 PH-8, 41211692886 PH-11 PH-17,
// 41279086755 TW-11 PH-5 PH-22, 41332990107 AW-17, 41385560100 AW-62, 41742521577 PH-7 PH-26 PH-27 PH-28, 41759029390 PH-7 PH-26. Each passed on the lane's own machine. tests/_test-fonts.mjs is the fix; these rules hold it:
//
//   TF-1  ONE PLACE. No page guard stubs the faces itself (Google's old sheet, tokens.css or the font files): an empty stub is the
//         machine's own fallback again.
//   TF-2  THE FACES ANSWER. Every family and weight the game's tokens ask for loads from the fixture.
//   TF-3  THE SAME WIDTH. A reference line in each face measures what it measures everywhere, within TOLERANCE: tight enough that
//         Linux's hinted advances (473 px for 469.5) are red. It prints the machine's own fallback beside it, so a log says how
//         far apart the two machines would have been. Measured on GitHub, rehearsal 41801603806: system-ui draws DejaVu Sans
//         (469.5, 526.8), serif and Georgia draw Liberation Serif (378, 394.7); here Segoe UI is 404.2 and Georgia Bold 475.6.
//
//   TF-5  THE BLOCK IS THERE. src/styles/tokens.css carries its self-hosted faces as ONE WEB FONTS block (2026-11-19), the block
//         the pin swaps: faces outside it would draw the real Alegreya in every guard, and only on the machines that have it.
//         The measured page carries play.html's own CSP, so a pin the page refuses (a font host the CSP no longer names) is TF-2.
//
//   TF-4  ON EVERY CONTROL. The browser's own sheet resets text-rendering on button, input, select and textarea, so a rule that stops at
//         :root leaves them hinted on Linux and only there (AW-62 on v0.2.89, 41922216241). Each must compute geometricPrecision,
//         which a Windows box can read too, and a button's label must measure the reference.
//
//   TF-6  THE PIN NEVER ENDS A RUN. The tokens.css route fetches the served sheet, and a fetch can fail (a kept-alive socket the
//         guard's server just shut: ECONNRESET). A route handler that rejects is an unhandled rejection: services-window and
//         chat-social --mutate died mid-sweep on release/v0.2.143 (run 44811275378). One retry, then an abort; a page already
//         gone is answered by nothing. Read over fake routes, so it holds on every machine.
//
// mutant-anchors: none — the proof plants into in-memory copies of the guards' text and into the stylesheet the page is served
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchOptions } from './_chrome.mjs';
import { isMain } from './_is-main.mjs';
import { FACES, FONT_CSS, FONT_PATH, WEB_FONTS, pinFonts, pinnedTokens } from './_test-fonts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = new Set(['_test-fonts.mjs', 'test-fonts.mjs']);
const STUB = /\.route\(\s*['"`][^'"`]*(?:fonts\.googleapis\.com|tokens\.css|assets\/fonts\/|__hr-test-fonts)/;
const ROOT = join(HERE, '..');
const TOKENS = 'src/styles/tokens.css';
const LINE = 'The hearth burns low: Offensive, Balanced, Defensive 1234567890';

/** Reference widths in CSS px at 14 px, measured with the pin: the same to the tenth on Windows and on GitHub. */
export const REFERENCE = {
  "400 14px 'Alegreya Sans'": 469.5,
  "700 14px 'Alegreya Sans'": 526.8,
  "700 14px 'Alegreya Sans SC'": 526.8,
  "400 14px 'Cinzel'": 378,
  "700 14px 'Cinzel'": 394.7,
};
export const TOLERANCE = 0.005;

/** TF-1: which guard texts stub the sheet themselves. Pure. */
export function stubbers(files) {
  return files.filter(([name, text]) => !SELF.has(name) && STUB.test(text)).map(([name]) => name);
}

/** TF-3: the widths that are off. Pure. */
export function offWidths(measured, reference = REFERENCE, tolerance = TOLERANCE) {
  return Object.entries(reference).filter(([font, want]) => !(Math.abs(measured[font] - want) <= want * tolerance))
    .map(([font, want]) => `${font} measures ${measured[font]}, the reference is ${want}`);
}

/** TF-5: the problem with tokens.css's faces, or null. Pure. */
export function blockProblem(css) {
  const blocks = css.match(new RegExp(WEB_FONTS.source, 'g')) || [];
  if (blocks.length !== 1) return `TF-5 ${TOKENS} carries ${blocks.length} WEB FONTS blocks, not one: the pin swaps exactly one`;
  if (/@font-face/.test(css.replace(WEB_FONTS, ''))) return `TF-5 ${TOKENS} declares a face outside its WEB FONTS block: every guard would draw it`;
  if (!/@font-face/.test(blocks[0])) return `TF-5 ${TOKENS}'s WEB FONTS block declares no face`;
  return null;
}

/** TF-6: what a tokens.css route handler does wrong when its fetch or its answer fails, over fake routes. Each case is
    [what, the fetch's answers in order (an Error rejects), whether fulfill and abort reject, what the route must end in]. */
const ROUTE_CASES = [
  ['a sheet served', ['body{}'], {}, 'fulfill'],
  ['a reset socket once, then the sheet', [new Error('read ECONNRESET'), 'body{}'], {}, 'fulfill'],
  ['a reset socket twice (the server is gone)', [new Error('read ECONNRESET'), new Error('read ECONNRESET')], {}, 'abort'],
  ['a page closed before the answer', ['body{}'], { fulfill: true }, 'nothing'],
  ['a page closed before the abort', [new Error('Target closed'), new Error('Target closed')], { abort: true }, 'nothing'],
];
export async function routeProblems(handler, cases = ROUTE_CASES) {
  const out = [];
  for (const [what, answers, rejects, want] of cases) {
    const did = [];
    let n = 0;
    const r = {
      fetch: async () => { const a = answers[Math.min(n++, answers.length - 1)]; if (a instanceof Error) throw a; return { text: async () => a }; },
      fulfill: async (o) => { did.push(['fulfill', o.body]); if (rejects.fulfill) throw new Error('Target closed'); },
      abort: async () => { did.push(['abort']); if (rejects.abort) throw new Error('Target closed'); },
    };
    let threw = null;
    try { await handler(r); } catch (e) { threw = e; }
    if (threw) { out.push(`TF-6 ${what}: the route handler rejected (${threw.message}), which ends the whole run`); continue; }
    const last = did.length ? did[did.length - 1][0] : 'nothing';
    if (want !== 'nothing' && last !== want) out.push(`TF-6 ${what}: the route ended in ${last}, not ${want}`);
    if (last === 'fulfill' && !String(did[did.length - 1][1]).includes(FONT_CSS)) out.push(`TF-6 ${what}: the sheet was answered without the pin`);
  }
  return out;
}

/** TF-2, TF-3 and TF-4 over one reading. */
function faults(m) {
  return [...Object.entries(m.loaded).filter(([, n]) => n < 1).map(([face]) => `TF-2 ${face} did not load from the fixture`), ...offWidths(m.widths).map((x) => `TF-3 ${x}`),
    ...Object.entries(m.controls).filter(([, v]) => String(v).toLowerCase() !== 'geometricprecision').map(([tag, v]) => `TF-4 a ${tag} computes text-rendering ${v}: hinted on Linux`),
    ...offWidths(m.button).map((x) => `TF-4 in a button, ${x}`)];
}

/* The measured page: play.html's own CSP and the real tokens.css, served from this machine (the pin fetches the sheet it swaps). */
function servePage() {
  const csp = (/<meta http-equiv="Content-Security-Policy"[^>]*>/.exec(readFileSync(join(ROOT, 'play.html'), 'utf8')) || [''])[0];
  if (!csp) throw new Error('play.html carries no CSP meta to measure under');
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(`<!doctype html><html><head>${csp}<link rel="stylesheet" href="/${TOKENS}"></head><body></body></html>`); }
    if (path === '/' + TOKENS) { res.writeHead(200, { 'Content-Type': 'text/css' }); return res.end(readFileSync(join(ROOT, TOKENS))); }
    res.writeHead(404); return res.end();
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function measure(pin = pinFonts) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(launchOptions({ headless: true }));
  const server = await servePage();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await pin(page);
    await page.goto('http://127.0.0.1:' + /** @type {import('node:net').AddressInfo} */ (server.address()).port + '/');
    return await page.evaluate(async ({ line, faces, fonts, machine }) => {
      const out = { widths: {}, loaded: {}, machine: {}, controls: {}, button: {} };
      const width = (font, mode) => {
        const s = document.createElement('span');
        s.style.cssText = `position:absolute;white-space:nowrap;font:${font};${mode ? `text-rendering:${mode};` : ''}`;
        s.textContent = line;
        document.body.append(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return Math.round(w * 10) / 10;
      };
      /* a face the page refuses (its CSP) rejects with a NetworkError: not loaded */
      for (const [family, weight] of faces) out.loaded[`${weight} ${family}`] = (await document.fonts.load(`${weight} 14px '${family}'`, line).catch(() => [])).length;
      await document.fonts.ready;
      for (const font of fonts) out.widths[font] = width(font);
      for (const tag of ['button', 'input', 'select', 'textarea']) {
        const c = document.createElement(tag);
        document.body.append(c);
        out.controls[tag] = getComputedStyle(c).textRendering;
        c.remove();
      }
      for (const font of fonts) {
        const b = document.createElement('button');
        b.style.cssText = `position:absolute;white-space:nowrap;padding:0;border:0;font:${font};letter-spacing:normal`;
        b.textContent = line;
        document.body.append(b);
        out.button[font] = Math.round(b.getBoundingClientRect().width * 10) / 10;
        b.remove();
      }
      for (const font of fonts) out.machine[`${font} (hinted, as Linux draws a web font)`] = width(font, 'auto');
      for (const font of machine) out.machine[font] = width(font);
      return out;
    }, { line: LINE, faces: FACES.map(([f, w]) => [f, w]), fonts: Object.keys(REFERENCE),
      machine: ['400 14px system-ui', '700 14px system-ui', '400 14px sans-serif', '400 14px "Segoe UI"', '400 14px serif', '700 14px serif', '700 14px Georgia', '400 14px Verdana', '400 14px "DejaVu Sans"', '700 14px "DejaVu Sans"', '400 14px "Liberation Serif"', '700 14px "Liberation Serif"'] });
  } finally { await browser.close(); server.close(); }
}

function guardTexts() {
  return readdirSync(HERE).filter((f) => f.endsWith('.mjs')).map((f) => [f, readFileSync(join(HERE, f), 'utf8')]);
}

async function rules() {
  const fails = [];
  const stub = stubbers(guardTexts());
  if (stub.length) fails.push(`TF-1 these guards stub the faces themselves; call pinFonts: ${stub.join(', ')}`);
  const block = blockProblem(readFileSync(join(ROOT, TOKENS), 'utf8'));
  if (block) fails.push(block);
  fails.push(...await routeProblems(pinnedTokens));
  const m = await measure();
  fails.push(...faults(m));
  for (const [font, w] of Object.entries(m.widths)) console.log(`  ${String(w).padStart(7)} px  ${font}`);
  for (const [font, w] of Object.entries(m.machine)) console.log(`  ${String(w).padStart(7)} px  this machine: ${font}`);
  return fails;
}

async function selftest() {
  let bad = 0;
  const expect = (ok, label) => { console.log(`  ${ok ? '✓' : '✗'} ${label}`); if (!ok) bad++; };
  /* TF-1, on the real guards' text: clean now, red with the old stub planted in a copy of one. */
  const texts = guardTexts();
  expect(stubbers(texts).length === 0, 'TF-1 reads the real guards: none stubs the sheet itself');
  const planted = texts.map(([n, t], i) => (i === 0 ? [n, `${t}\nawait page.route('**/src/styles/tokens.css*', (r) => r.fulfill({ contentType: 'text/css', body: '' }));`] : [n, t]));
  expect(stubbers(planted).length === 1, 'TF-1 catches a guard that stubs tokens.css with an empty body');
  expect(stubbers([['x.mjs', "page.route('**/assets/fonts/**', (r) => r.abort())"]]).length === 1, 'TF-1 catches a guard that stubs the font files');
  expect(stubbers([['_test-fonts.mjs', "x.route('**/src/styles/tokens.css*'"]]).length === 0, 'TF-1 lets the one helper route it');
  /* TF-6 over fake routes: the real handler is clean; the handler as v0.2.143 shipped it (no catch), one that never retries,
     one that drops the pin, and one whose abort can reject are each caught. */
  expect((await routeProblems(pinnedTokens)).length === 0, 'TF-6 reads the real tokens.css route: every failed fetch ends in an answer or nothing, never a rejection');
  const shipped = async (r) => { const res = await r.fetch(); return r.fulfill({ response: res, contentType: 'text/css', body: FONT_CSS + await res.text() }); };
  expect((await routeProblems(shipped)).some((x) => /rejected \(read ECONNRESET\)/.test(x)), 'TF-6 catches the v0.2.143 route (a reset socket rejects and ends the run)');
  const once = async (r) => { try { const res = await r.fetch(); return await r.fulfill({ body: FONT_CSS + await res.text() }).catch(() => undefined); } catch { return r.abort().catch(() => undefined); } };
  expect((await routeProblems(once)).some((x) => /once, then the sheet: the route ended in abort/.test(x)), 'TF-6 catches a route that never retries a reset socket');
  const unpinned = async (r) => { const res = await r.fetch(); return r.fulfill({ body: await res.text() }); };
  expect((await routeProblems(unpinned, ROUTE_CASES.slice(0, 1))).some((x) => /without the pin/.test(x)), 'TF-6 catches a sheet answered without the pin');
  const bareAbort = async (r) => { for (let i = 0; i < 2; i++) { try { const res = await r.fetch(); return await r.fulfill({ body: FONT_CSS + await res.text() }).catch(() => undefined); } catch { /* again */ } } return r.abort(); };
  expect((await routeProblems(bareAbort)).some((x) => /closed before the abort: the route handler rejected/.test(x)), 'TF-6 catches an abort that rejects on a page already gone');
  /* TF-5 pure, on the real sheet and planted copies. */
  const real = readFileSync(join(ROOT, TOKENS), 'utf8');
  expect(blockProblem(real) === null, 'TF-5 reads the real tokens.css: one WEB FONTS block');
  expect(/TF-5/.test(blockProblem(real.replace(WEB_FONTS, '')) || ''), 'TF-5 catches a tokens.css with no block');
  expect(/outside/.test(blockProblem(real + "\n@font-face{font-family:'Cinzel';src:url(x.woff2)}") || ''), 'TF-5 catches a face declared outside the block');
  /* TF-3 pure. */
  const at = (k) => Object.fromEntries(Object.entries(REFERENCE).map(([f, w]) => [f, w * k]));
  expect(offWidths(at(1)).length === 0, 'TF-3 is green at the reference');
  expect(offWidths(at(1 + TOLERANCE / 2)).length === 0, 'TF-3 is green inside the tolerance');
  expect(offWidths({ ...at(1), "400 14px 'Alegreya Sans'": 473 }).length === 1, 'TF-3 catches Linux\'s hinted width (473 for 469.5)');
  expect(offWidths(at(0.88)).length === Object.keys(REFERENCE).length, 'TF-3 catches Segoe UI\'s width (12% narrower)');
  expect(offWidths({}).length === Object.keys(REFERENCE).length, 'TF-3 catches a width that was never measured');
  /* The pin itself, on a real page: each planted fault shows in the rules' own readings. */
  const sheet = (css) => (target) => pinFonts(target, css);
  expect(faults(await measure()).length === 0, 'the pin loads every face and measures the reference on this machine');
  expect(faults(await measure(sheet(''))).some((x) => x.startsWith('TF-2')), 'the empty stub (the machine\'s own fallback, here or on GitHub) is caught');
  expect(faults(await measure(sheet(FONT_CSS.replaceAll('dejavu-sans-400', 'liberation-serif-400')))).some((x) => x.startsWith('TF-3')), 'the wrong file behind a family is caught');
  expect(faults(await measure(sheet(FONT_CSS.replaceAll("'Cinzel'", "'Cinzle'")))).some((x) => x.startsWith('TF-2')), 'a family name the tokens do not ask for is caught');
  expect(faults(await measure(sheet(FONT_CSS.replaceAll(FONT_PATH, 'https://fonts.gstatic.com/hr-test/')))).some((x) => x.startsWith('TF-2')), 'faces from a host the page\'s CSP refuses (the old pin, after the self-hosting) are caught');
  expect(FONT_CSS.startsWith('*,*::before,*::after{text-rendering:geometricPrecision}'), 'the sheet still opens with the rule the next mutant moves');
  expect(faults(await measure(sheet(FONT_CSS.replace('*,*::before,*::after{', ':root{')))).some((x) => x.startsWith('TF-4 a button')), 'the rule on :root alone (v0.2.89\'s AW-62) is caught, on any machine');
  expect(faults(await measure(sheet(FONT_CSS.replace('*,*::before,*::after{text-rendering:geometricPrecision}', '')))).some((x) => x.startsWith('TF-4 a button')), 'no rule at all is caught');
  console.log(bad ? `test-fonts --selftest: ${bad} failed` : 'test-fonts --selftest: every planted defect caught');
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) process.exit(await selftest());
  const fails = await rules();
  for (const f of fails) console.log(`  ✗ ${f}`);
  console.log(fails.length ? `test-fonts: ${fails.length} rule(s) RED` : 'test-fonts: one font on this machine, at the reference widths');
  process.exit(fails.length ? 1 : 0);
}
