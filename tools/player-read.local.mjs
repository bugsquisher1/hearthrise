// tools/player-read.local.mjs — THE PLAYER-READ GATE: every new or changed line a player will read, in one file a reader
// judges before a release (Tyler 2026-11-09: "I'm sick of reading shit that sounds like a AI developer or a god damn broken
// english mess"). copy-lint's PERSON rules catch the shapes a pattern can name; a person catches the rest.
//
//   node tools/player-read.local.mjs <base-ref>            list every new, changed or cut player line from base-ref to HEAD
//   node tools/player-read.local.mjs <base-ref> --out F    write the list to F (default: the OS temp dir, path printed)
//   node tools/player-read.local.mjs --rubric              the reader's yes/no questions (docs/DESIGN_STANDARDS.md §3 "Tyler's voice")
//   node tools/player-read.local.mjs --selftest            the diff rules on fixtures
//
// WHAT IT READS. Every row of src/data/text/*.js (a plural row's forms each on their own line, keyed surface.key.form), the
// newest CHANGELOG.md entry (its lines that base's copy of the same entry lacks), and every .claude/notes-v*.md the range
// changed (its added lines). A cut row is listed too, so the reader sees what went.
// AND EVERY OTHER PLAYER STRING IN src/data (lane/d-plain-lore, 2026-11-11: the gate read only the text tables, so item
// flavour, monster and class lines, ground themes, trophy and NPC lines, title words and end-of-hunt lines went unread).
// For each src/data file the range changed (src/data/text excepted, read above), every string literal on a changed line that
// reads as prose (three or more words, a lower-case letter) is listed as DATA, paired with the literal it replaced. The
// literals come from copy-lint's tokenizer over the WHOLE file, so a comment's apostrophe is never a line.
// AUTO FLAGS. Every listed line is also checked against OLD_WORDS: the old, military and storybook words and the AI tells a
// reader kept finding (Tyler 2026-11-11 on "The foot died in their files at the toll stone": "Fix your voice"). A hit is
// written FLAG(auto: ...) and the run exits 1; it blocks the release like a reader's flag. No hit proves nothing: the
// reader still judges every line.
// THE GATE (the Coordinator, before every release): a fresh reader, never the author of the lines, answers --rubric for each
// line. A line with any "no" is flagged and blocks the release until it is rewritten.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringLiterals } from '../tests/copy-lint.mjs';

export const RUBRIC = Object.freeze([
  'Does it lead with what happens to the player, or what they can do?',
  'Would Tyler say it out loud to a friend across the table, word for word?',
  'Does it say "you" and use contractions where a person would (you\'re, can\'t, there\'s)?',
  'Is every word an everyday word a new player knows (no "pull", "floor", "struck", "server", "version", "tier ladder")?',
  'Does it say it as a sentence, not a labeled field ("Requires: any weapon.", "Drink: restores mana.", "Numbers for")?',
  'Does it skip narrating the machinery (the server, a slot\'s state, what the screen "reads as", "this hero\'s")?',
  'Does each sentence have a verb, and say one thing?',
  'Would the player miss it if it were cut? If not, cut it.',
  'On a card or a hover, is it a few plain words, with exact numbers left to the wiki and the analyzer?',
  'Is it spelled right, capitalized right, American, with no semicolons, em dashes or clauses glued with a colon?',
]);

/* Words no line a player reads should use (whole words, any case). Each is a word a person across the table wouldn't say,
   or a tell of copy written to sound like a book: the armor words have plain names (belt, chestplate, hood, vest, arm
   guards), the rest say the thing in everyday words. Not here on purpose: "keen" (a jewelry perk's name), "ward" (a word
   inside "toward"/"reward" is safe, but a bare one may be a rule's name), "fallen" (fallen apples), "greaves" (in names). */
export const OLD_WORDS = Object.freeze([
  'foe', 'foes', 'warding', 'warded', 'girdle', 'cuirass', 'coif', 'vambrace', 'vambraces', 'sabaton', 'sabatons', 'jerkin',
  'arcane', 'peerless', 'pinnacle', 'realm', 'slain', 'felled', 'wrested', 'wrought', 'delver', 'naught', 'ere', 'whilst',
  'betwixt', 'thee', 'thy', 'hath', 'doth', 'honest', 'humble', 'grim', 'dread', 'somber', 'radiant', 'luminous', 'rite',
]);
/* Phrases, any case: storybook shapes a reader flagged in shipped lines. */
export const OLD_PHRASES = Object.freeze([
  'has any right to', 'in their files', 'nobody burned', 'still holds', 'legends speak', 'ancient evil', 'the very peak',
]);

/** The old words and phrases in `text`, in the order found: [] when it reads clean. */
export function autoFlags(text) {
  const s = String(text || '');
  const hits = [];
  for (const w of OLD_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(s)) hits.push(w);
  for (const p of OLD_PHRASES) if (s.toLowerCase().includes(p)) hits.push(`"${p}"`);
  return hits;
}

/** A string literal a player could read: three or more words and a lower-case letter, not a path, an id or a query. */
export function isProse(text) {
  const s = String(text || '').trim();
  if (!/[a-z]/.test(s) || s.split(/\s+/).length < 3) return false;
  if (/^(src|tests|tools|supabase|docs)\//.test(s) || /\.(m?js|sql|json|md)\b/.test(s)) return false;
  if (/^\s*(select|insert|update|delete|create|alter)\b/i.test(s)) return false;
  return true;
}

/** The prose literals of a whole source, each with its 1-based line: [{ text, line }]. */
export function proseLiterals(src) {
  if (src === null || src === undefined) return [];
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  const lineOf = (at) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= at) lo = m; else hi = m - 1; } return lo + 1; };
  return stringLiterals(src).filter((l) => isProse(l.text)).map((l) => ({ text: l.text, line: lineOf(l.at) }));
}

/** A -U0 diff's hunks: [{ old: [line], now: [line] }], the removed lines of the old file and the added lines of the new. */
export function hunks(diff) {
  const out = [];
  for (const l of String(diff).split(/\r?\n/)) {
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l);
    if (!h) continue;
    const span = (start, n) => Array.from({ length: n === undefined ? 1 : Number(n) }, (_, i) => Number(start) + i);
    out.push({ old: span(h[1], h[2]), now: span(h[3], h[4]) });
  }
  return out;
}

/** The player strings a file's change touched: CHANGED (with what it was), NEW, or CUT, hunk by hunk, in order. */
export function dataLines(baseSrc, headSrc, diff, file) {
  const was = proseLiterals(baseSrc), now = proseLiterals(headSrc);
  const out = [];
  for (const h of hunks(diff)) {
    const olds = new Set(h.old), news = new Set(h.now);
    const a = was.filter((l) => olds.has(l.line)), b = now.filter((l) => news.has(l.line));
    const gone = new Set(a.map((l) => l.text)), stay = new Set(b.map((l) => l.text));
    const cut = a.filter((l) => !stay.has(l.text)), added = b.filter((l) => !gone.has(l.text));
    added.forEach((l, i) => out.push(i < cut.length
      ? { kind: 'DATA', id: `${file}:${l.line}`, text: l.text, was: cut[i].text }
      : { kind: 'DATA', id: `${file}:${l.line}`, text: l.text }));
    for (const l of cut.slice(added.length)) out.push({ kind: 'CUT', id: `${file}:${l.line}`, text: '', was: l.text });
  }
  return out;
}

const TEXT_DIR = 'src/data/text/';
const DATA_DIR = 'src/data/';
const REGISTRY = 'text-table.js';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
function show(ref, path) {
  try { return git(['show', `${ref}:${path}`]); } catch { return null; }
}

/** The rows of one text table file's source: [[id, text]] with plural forms as id.form. */
export async function rowsOf(surface, src) {
  if (src === null) return [];
  const mod = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(src));
  const table = Object.values(mod).find((v) => v && typeof v === 'object');
  const out = [];
  for (const [key, v] of Object.entries(table || {})) {
    if (typeof v === 'string') out.push([`${surface}.${key}`, v]);
    else if (v && typeof v === 'object') for (const [form, s] of Object.entries(v)) out.push([`${surface}.${key}.${form}`, String(s)]);
  }
  return out;
}

/** New, changed and cut rows between two row lists, in head's order (cuts last). */
export function diffRows(baseRows, headRows) {
  const was = new Map(baseRows);
  const now = new Map(headRows);
  const out = [];
  for (const [id, text] of headRows) {
    if (!was.has(id)) out.push({ kind: 'NEW', id, text });
    else if (was.get(id) !== text) out.push({ kind: 'CHANGED', id, text, was: was.get(id) });
  }
  for (const [id, text] of baseRows) if (!now.has(id)) out.push({ kind: 'CUT', id, text: '', was: text });
  return out;
}

/** The newest CHANGELOG entry's lines that base's copy of the same entry lacks: [{ id, text }]. */
export function changelogLines(baseLog, headLog) {
  const entry = (log, version) => {
    const lines = String(log || '').split(/\r?\n/);
    const at = lines.findIndex((l) => (version ? l.startsWith(`## v${version} `) || l === `## v${version}` : /^## v\d/.test(l)));
    if (at < 0) return { version: null, lines: [] };
    const end = lines.findIndex((l, i) => i > at && /^## v\d/.test(l));
    return { version: /^## v(\S+)/.exec(lines[at])[1], at, lines: lines.slice(at, end < 0 ? lines.length : end) };
  };
  const head = entry(headLog, null);
  if (!head.version) return [];
  const old = new Set(entry(baseLog, head.version).lines);
  return head.lines.map((text, i) => ({ id: `CHANGELOG v${head.version}:${head.at + i + 1}`, text }))
    .filter((l) => l.text.trim() && !old.has(l.text));
}

/** The lines a unified diff (-U0) adds to its file: [{ id, text }]. */
export function addedLines(diff, file) {
  const out = [];
  let line = 0;
  for (const l of String(diff).split(/\r?\n/)) {
    const h = /^@@ -\S+ \+(\d+)/.exec(l);
    if (h) { line = Number(h[1]); continue; }
    if (l.startsWith('+') && !l.startsWith('+++')) { if (l.slice(1).trim()) out.push({ id: `${file}:${line}`, text: l.slice(1) }); line++; }
  }
  return out;
}

const render = (e) => (e.kind === 'CUT' ? `CUT      ${e.id}\t(was: ${e.was})`
  : `${e.flags && e.flags.length ? `FLAG(auto: ${e.flags.join(', ')}) ` : ''}${e.kind.padEnd(8)} ${e.id}\t${e.text}${e.was !== undefined ? `\t(was: ${e.was})` : ''}`);

async function list(base, outPath) {
  git(['rev-parse', '--verify', `${base}^{commit}`]);
  const headSha = git(['rev-parse', '--short', 'HEAD']).trim();
  const baseSha = git(['rev-parse', '--short', `${base}^{commit}`]).trim();
  const files = new Set([...git(['ls-tree', '--name-only', 'HEAD', TEXT_DIR]).split('\n'),
    ...git(['ls-tree', '--name-only', base, TEXT_DIR]).split('\n')].filter((f) => f.endsWith('.js') && !f.endsWith(REGISTRY)));
  const entries = [];
  for (const f of [...files].sort()) {
    const surface = f.slice(TEXT_DIR.length, -3);
    entries.push(...diffRows(await rowsOf(surface, show(base, f)), await rowsOf(surface, show('HEAD', f))));
  }
  for (const l of changelogLines(show(base, 'CHANGELOG.md'), show('HEAD', 'CHANGELOG.md'))) entries.push({ kind: 'CHANGELOG', ...l });
  const notes = git(['diff', '--name-only', base, 'HEAD', '--', '.claude']).split('\n').filter((f) => /(^|\/)notes-v[^/]*\.md$/.test(f));
  for (const f of notes) for (const l of addedLines(git(['diff', '-U0', base, 'HEAD', '--', f]), f)) entries.push({ kind: 'NOTES', ...l });
  const data = git(['diff', '--name-only', base, 'HEAD', '--', DATA_DIR]).split('\n')
    .filter((f) => f.endsWith('.js') && !f.startsWith(TEXT_DIR)).sort();
  for (const f of data) entries.push(...dataLines(show(base, f), show('HEAD', f), git(['diff', '-U0', base, 'HEAD', '--', f]), f));
  for (const e of entries) if (e.kind !== 'CUT') e.flags = autoFlags(e.text);
  const flagged = entries.filter((e) => e.flags && e.flags.length);
  const out = outPath || join(tmpdir(), `player-read-${baseSha}..${headSha}.txt`);
  const head = [
    `# PLAYER READ ${baseSha}..${headSha}: ${entries.length} line(s) a player will read that are new, changed or cut.`,
    '# Judge each NEW, CHANGED, DATA, CHANGELOG and NOTES line against the rubric (node tools/player-read.local.mjs --rubric).',
    '# Any "no": write FLAG and the reason at the start of its line. A flagged line blocks the release until rewritten.',
    '# FLAG(auto: ...) lines use a word from OLD_WORDS / OLD_PHRASES: rewrite them before a reader starts.',
    '# Never judge lines you wrote. {name} is a placeholder the game fills in.',
    '',
  ];
  writeFileSync(out, head.concat(entries.map(render)).join('\n') + '\n');
  const by = (k) => entries.filter((e) => e.kind === k).length;
  console.log(`player-read ${baseSha}..${headSha}: ${by('NEW')} new, ${by('CHANGED')} changed, ${by('DATA')} data, ${by('CUT')} cut, ${by('CHANGELOG')} changelog, ${by('NOTES')} notes line(s)`);
  for (const e of flagged) console.log(`  FLAG(auto: ${e.flags.join(', ')}) ${e.id}\t${e.text}`);
  console.log(flagged.length ? `  ${flagged.length} line(s) auto-flagged: rewrite them` : '  0 auto-flagged');
  console.log(`  → ${out}`);
  return flagged.length ? 1 : 0;
}

async function selftest() {
  let bad = 0;
  const check = (ok, what) => { console.log(`  ${ok ? 'ok    ' : 'FAILED'}  ${what}`); if (!ok) bad++; };
  const base = await rowsOf('bar', "// a comment\nexport const BAR_TEXT = Object.freeze({\n  a: 'Same.',\n  b: 'Requires: any weapon.',\n"
    + "  c: { one: '{n} waits.', other: '{n} wait.' },\n  gone: 'Numbers for the {rune}.',\n});\n");
  const head = await rowsOf('bar', "export const BAR_TEXT = Object.freeze({\n  a: 'Same.',\n  b: 'Works with any weapon.',\n"
    + "  c: { one: '{n} waits.', other: '{n} wait in your bag.' },\n  added: 'Hits your target.',\n});\n");
  const d = diffRows(base, head);
  check(d.length === 4, `four entries, the unchanged row left out (${d.map((e) => e.kind + ' ' + e.id).join(', ')})`);
  check(d.some((e) => e.kind === 'CHANGED' && e.id === 'bar.b' && e.was === 'Requires: any weapon.'), 'a changed row, with what it was');
  check(d.some((e) => e.kind === 'CHANGED' && e.id === 'bar.c.other') && !d.some((e) => e.id === 'bar.c.one'), 'a plural row, form by form');
  check(d.some((e) => e.kind === 'NEW' && e.id === 'bar.added'), 'a new row');
  check(d.some((e) => e.kind === 'CUT' && e.id === 'bar.gone'), 'a cut row');
  check((await rowsOf('bar', null)).length === 0, 'a file the ref does not hold has no rows');
  const log = (v, body) => `# Changelog\n\n## v${v} (Words)\n\n${body}\n\n## v0.2.1 (Old)\n\n- Old line.\n`;
  const cl = changelogLines(log('0.2.5', '- Kept line.'), log('0.2.5', '- Kept line.\n- New line.'));
  check(cl.length === 1 && cl[0].text === '- New line.' && /^CHANGELOG v0\.2\.5:\d+$/.test(cl[0].id), 'the newest CHANGELOG entry: only its new lines');
  check(changelogLines(log('0.2.4', '- Kept line.'), log('0.2.5', '- Kept line.')).length === 2, 'a new CHANGELOG entry: every line, heading included');
  const added = addedLines('+++ b/.claude/notes-v1.md\n@@ -3,0 +4,2 @@\n+First new.\n+\n@@ -9 +11 @@\n-old\n+Second new.\n', 'n.md');
  check(added.map((a) => a.id + ' ' + a.text).join('|') === 'n.md:4 First new.|n.md:11 Second new.', 'notes: added lines with their line numbers');
  /* DATA: an item flavour line outside the text tables (lane/d-plain-lore). Line 3 is rewritten with storybook words; a
     comment with an apostrophe on line 2 changes too, and must never become a line; line 5 is new and plain. */
  const was = "export const ITEM_DESC = {\n  // Tyler's note\n  'iron_helm': 'Honest iron helm that turns a glancing strike aside',\n  'oak_log': 'A sturdy oak log, sawn into planks or burned for fuel',\n};\n";
  const now = "export const ITEM_DESC = {\n  // Tyler's other note\n  'iron_helm': 'A cuirass of grim steel to ward thee from thy foes',\n  'oak_log': 'A sturdy oak log, sawn into planks or burned for fuel',\n  'new_row': 'A plain iron helmet. It will turn a glancing hit',\n};\n";
  const dl = dataLines(was, now, '@@ -2,2 +2,2 @@\n-a\n-b\n+a\n+b\n@@ -4,0 +5 @@\n+c\n', 'src/data/item-descriptions.js');
  const planted = dl.find((e) => e.id === 'src/data/item-descriptions.js:3');
  check(dl.length === 2 && planted && planted.kind === 'DATA' && planted.was === 'Honest iron helm that turns a glancing strike aside',
    `an item flavour line outside src/data/text is listed with what it was, the comment is not (${dl.map((e) => e.id).join(', ')})`);
  check(planted && autoFlags(planted.text).join(',') === 'foes,cuirass,thee,thy,grim', `the planted storybook line is auto-flagged (${planted && autoFlags(planted.text)})`);
  check(dl.some((e) => e.id === 'src/data/item-descriptions.js:5' && e.text.startsWith('A plain iron helmet')) && autoFlags('A plain iron helmet. It will turn a glancing hit').length === 0,
    'a new plain line is listed and reads clean');
  check(autoFlags('The foot died in their files and nobody burned them. The Bannerman still holds the Company Colors').length === 3,
    'the 11-11 board line trips three phrases');
  check(autoFlags('A Banded Signet for fighters with Keen. Reward toward the write-up, Grimtusk').length === 0, 'Keen, reward, toward, write and Grimtusk are not old words');
  check(dataLines(was, was, '', 'f.js').length === 0 && !isProse('src/data/items.js') && !isProse('copper_ore') && isProse('Hits your target now'), 'no diff, no lines; a path or an id is not prose');
  console.log(bad ? `player-read selftest: ${bad} FAILED` : 'player-read selftest: ok');
  return bad ? 1 : 0;
}

const args = process.argv.slice(2);
try {
  if (args.includes('--rubric')) {
    console.log('PLAYER READ RUBRIC (docs/DESIGN_STANDARDS.md §3 "Tyler\'s voice"). Any "no" flags the line.');
    RUBRIC.forEach((q, i) => console.log(`  ${String(i + 1).padStart(2)}. ${q}`));
    process.exit(0);
  }
  if (args.includes('--selftest')) process.exit(await selftest());
  const base = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out');
  if (!base) { console.error('usage: node tools/player-read.local.mjs <base-ref> [--out file] | --rubric | --selftest'); process.exit(2); }
  process.exit(await list(base, args.includes('--out') ? args[args.indexOf('--out') + 1] : null));
} catch (e) { console.error('player-read harness error:', e.message || e); process.exit(2); }
