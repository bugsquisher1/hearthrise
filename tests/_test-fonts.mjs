// tests/_test-fonts.mjs — THE PAGE GUARDS DRAW ONE FONT ON EVERY MACHINE.
//
// Every page guard stubbed Google's stylesheet with an empty body, so the page fell back to the machine's own fonts: Segoe UI
// and Georgia on Windows, DejaVu Sans and Liberation Serif on GitHub. A lane's green on Windows said nothing of GitHub's,
// and 7 of the last 30 red release runs held a rule or a mutant that differed only there (AW-17, AW-62, PH-5, PH-7, PH-8,
// PH-11, PH-17, PH-22, PH-26, PH-27, PH-28, TW-11; tests/test-fonts.mjs names the runs). So the web font's names now
// resolve, on every machine, to GitHub's own fallback faces, carried in tests/fixtures/fonts: GitHub draws what it always
// drew and Windows draws what GitHub draws. They are wide faces on purpose: the rules keep judging a player whose web font
// never came, and --f-ui-aspect (font-size-adjust) still brings a label with no room to spare down to Alegreya's width.
//
// text-rendering: geometricPrecision is what makes the widths the SAME, not near. Linux hints a web font's advances (a 14 px line
// measured 473 px against DejaVu's own 469.5, rehearsal 41801603806, and AW-17 and AW-62 went red on it); this rule draws
// them unhinted, as Windows and every phone do: 469.5, 526.8, 378 and 394.7 px on both machines, GitHub's old fallback to the tenth.
//
// A --shots run that wants the real faces does not call this, and loads Google's sheet as before.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fonts');
const ORIGIN = 'https://fonts.gstatic.com/hr-test/';

/** [the name the game's tokens ask for, weight, the file that draws it]. Weights between resolve as CSS says: 500 to 400, 600 to 700. */
export const FACES = [
  ['Alegreya Sans', 400, 'dejavu-sans-400'], ['Alegreya Sans', 700, 'dejavu-sans-700'],
  ['Alegreya Sans SC', 400, 'dejavu-sans-400'], ['Alegreya Sans SC', 700, 'dejavu-sans-700'],
  ['Cinzel', 400, 'liberation-serif-400'], ['Cinzel', 700, 'liberation-serif-700'],
];

/** The stylesheet that stands where Google's did. */
export const FONT_CSS = `:root{text-rendering:geometricPrecision}${FACES.map(([family, weight, file]) => `@font-face{font-family:'${family}';font-weight:${weight};font-display:block;src:url(${ORIGIN}${file}.ttf) format('truetype')}`).join('')}`;

const bytes = new Map();
function fileOf(name) {
  if (!bytes.has(name)) bytes.set(name, readFileSync(join(DIR, name)));
  return bytes.get(name);
}

/** On a page or a context: the web font's names draw the test faces, offline and identically everywhere. */
export async function pinFonts(target) {
  await target.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: FONT_CSS }));
  await target.route(`${ORIGIN}**`, (r) => {
    const name = r.request().url().slice(ORIGIN.length).split('?')[0];
    return r.fulfill({ contentType: 'font/ttf', body: fileOf(name) });
  });
}
