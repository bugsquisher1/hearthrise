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
//   TF-1  ONE PLACE. No page guard stubs Google's stylesheet itself: an empty stub is the machine's own fallback again.
//   TF-2  THE FACES ANSWER. Every family and weight the game's tokens ask for loads from the fixture.
//   TF-3  THE SAME WIDTH. A reference line in each face measures what it measures everywhere, within TOLERANCE: tight enough that
//         Linux's hinted advances (473 px for 469.5) are red. It prints the machine's own fallback beside it, so a log says how
//         far apart the two machines would have been. Measured on GitHub, rehearsal 41801603806: system-ui draws DejaVu Sans
//         (469.5, 526.8), serif and Georgia draw Liberation Serif (378, 394.7); here Segoe UI is 404.2 and Georgia Bold 475.6.
//
//   TF-4  ON EVERY CONTROL. The browser's own sheet resets text-rendering on button, input, select and textarea, so a rule that stops at
//         :root leaves them hinted on Linux and only there (AW-62 on v0.2.89, 41922216241). Each must compute geometricPrecision,
//         which a Windows box can read too, and a button's label must measure the reference.
//
// mutant-anchors: none — the proof plants into in-memory copies of the guards' text and into the stylesheet the page is served
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchOptions } from './_chrome.mjs';
import { isMain } from './_is-main.mjs';
import { FACES, FONT_CSS, pinFonts } from './_test-fonts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SELF = new Set(['_test-fonts.mjs', 'test-fonts.mjs']);
const STUB = /\.route\(\s*['"`]https:\/\/fonts\.googleapis\.com/;
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

/** TF-2, TF-3 and TF-4 over one reading. */
function faults(m) {
  return [...Object.entries(m.loaded).filter(([, n]) => n < 1).map(([face]) => `TF-2 ${face} did not load from the fixture`), ...offWidths(m.widths).map((x) => `TF-3 ${x}`),
    ...Object.entries(m.controls).filter(([, v]) => String(v).toLowerCase() !== 'geometricprecision').map(([tag, v]) => `TF-4 a ${tag} computes text-rendering ${v}: hinted on Linux`),
    ...offWidths(m.button).map((x) => `TF-4 in a button, ${x}`)];
}

async function measure(pin = pinFonts) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch(launchOptions({ headless: true }));
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await pin(page);
    await page.route('http://hr-test.invalid/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=x"></head><body></body></html>' }));
    await page.goto('http://hr-test.invalid/');
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
      for (const [family, weight] of faces) out.loaded[`${weight} ${family}`] = (await document.fonts.load(`${weight} 14px '${family}'`, line)).length;
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
  } finally { await browser.close(); }
}

function guardTexts() {
  return readdirSync(HERE).filter((f) => f.endsWith('.mjs')).map((f) => [f, readFileSync(join(HERE, f), 'utf8')]);
}

async function rules() {
  const fails = [];
  const stub = stubbers(guardTexts());
  if (stub.length) fails.push(`TF-1 these guards stub Google's stylesheet themselves; call pinFonts: ${stub.join(', ')}`);
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
  const planted = texts.map(([n, t], i) => (i === 0 ? [n, `${t}\nawait page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));`] : [n, t]));
  expect(stubbers(planted).length === 1, 'TF-1 catches a guard that stubs the sheet with an empty body');
  expect(stubbers([['_test-fonts.mjs', "x.route('https://fonts.googleapis.com/**'"]]).length === 0, 'TF-1 lets the one helper route it');
  /* TF-3 pure. */
  const at = (k) => Object.fromEntries(Object.entries(REFERENCE).map(([f, w]) => [f, w * k]));
  expect(offWidths(at(1)).length === 0, 'TF-3 is green at the reference');
  expect(offWidths(at(1 + TOLERANCE / 2)).length === 0, 'TF-3 is green inside the tolerance');
  expect(offWidths({ ...at(1), "400 14px 'Alegreya Sans'": 473 }).length === 1, 'TF-3 catches Linux\'s hinted width (473 for 469.5)');
  expect(offWidths(at(0.88)).length === Object.keys(REFERENCE).length, 'TF-3 catches Segoe UI\'s width (12% narrower)');
  expect(offWidths({}).length === Object.keys(REFERENCE).length, 'TF-3 catches a width that was never measured');
  /* The pin itself, on a real page: each planted fault shows in the rules' own readings. */
  const sheet = (css) => async (target) => {
    await pinFonts(target);
    await target.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: css }));
  };
  expect(faults(await measure()).length === 0, 'the pin loads every face and measures the reference on this machine');
  expect(faults(await measure(sheet(''))).some((x) => x.startsWith('TF-2')), 'the empty stub (the machine\'s own fallback, here or on GitHub) is caught');
  expect(faults(await measure(sheet(FONT_CSS.replaceAll('dejavu-sans-400', 'liberation-serif-400')))).some((x) => x.startsWith('TF-3')), 'the wrong file behind a family is caught');
  expect(faults(await measure(sheet(FONT_CSS.replaceAll("'Cinzel'", "'Cinzle'")))).some((x) => x.startsWith('TF-2')), 'a family name the tokens do not ask for is caught');
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
