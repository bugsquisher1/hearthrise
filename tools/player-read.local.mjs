// tools/player-read.local.mjs — THE PLAYER-READ GATE: every new or changed line a player will read, in one file a reader
// judges before a release (Tyler 2026-11-09: "I'm sick of reading shit that sounds like a AI developer or a god damn broken
// english mess"). No pattern judges voice (Tyler 2026-11-16, the copy-lint voice rules dropped): a person reads every line.
//
//   node tools/player-read.local.mjs <base-ref>            list every new, changed or cut player line from base-ref to HEAD
//   node tools/player-read.local.mjs <base-ref> --out F    write the list to F (default: the OS temp dir, path printed)
//   node tools/player-read.local.mjs <base-ref> --head R   read base-ref..R instead of base-ref..HEAD (a past range, e.g. a cut)
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
// AND EVERY UNCHANGED LINE THAT NAMES WHAT THE RANGE CUT (lane/c-guard-batch-142). The v0.2.141 cookbook cut took Dragon Stew
// and Lich Soul Soup out of src/data, but dragon_scale's and lich_soul's flavour, untouched, still sent cooks to them; the list
// above holds changed lines only, so a reader found them by luck. Now: every id (snake_case) and display name (an `n:` or
// `name:` value, the way items, monsters and places are named) that base's copy of a changed src/data file held and head's
// src/data holds nowhere is cut, and every player line at head that names one (a text row, or a prose literal in src/data) is
// listed as ORPHAN, auto-flagged `names cut "<name>"`; a changed line that names one gets the same flag. Not `label:`/`title:`:
// measured on v0.2.120..v0.2.141, those are UI words ("Weapons", "Damage you deal"), and "Weapons and styles" read as a hit.
// THE GATE (the Coordinator, before every release): a fresh reader, never the author of the lines, answers --rubric for each
// line. A line with any "no" is flagged and blocks the release until it is rewritten.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { stringLiterals } from '../tests/copy-lint.mjs';
import { isMain } from '../tests/_is-main.mjs';

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

/* git in `cwd` (the repo the process stands in, or the selftest's own fixture repo). */
const gitIn = (cwd) => (args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

/** Every one of `paths` at `ref`, read by ONE git process: Map(path -> source); a path the ref lacks is left out. */
function showAll(cwd, ref, paths) {
  const out = new Map();
  if (!paths.length) return out;
  const buf = execFileSync('git', ['cat-file', '--batch'], { cwd, input: paths.map((p) => `${ref}:${p}`).join('\n') + '\n',
    maxBuffer: 512 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
  let at = 0;
  for (const p of paths) {
    const nl = buf.indexOf(10, at);
    if (nl < 0) throw new Error(`git cat-file stopped before ${ref}:${p}`);
    const head = /^\S+ (\S+) (\d+)$/.exec(buf.toString('utf8', at, nl));
    at = nl + 1;
    if (!head) continue;   // "<ref>:<path> missing"
    const size = Number(head[2]);
    if (head[1] === 'blob') out.set(p, buf.toString('utf8', at, at + size));
    at += size + 1;
  }
  return out;
}

/* ── WHAT A RANGE CUT, AND THE UNCHANGED LINES THAT STILL NAME IT (lane/c-guard-batch-142, see the header) ── */
/* Strings first, so a `//` inside a string is never a comment. A regex literal holding a quote would mislead it; src/data has none
   that matters, and the worst it does is miss a name. */
const LEX = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\[\s\S]|[^`\\])*`)/g;
const SNAKE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
const SNAKE_IN_CODE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;
const NAME_KEY = /(?:^|[^\w$.])(?:n|name)\s*:\s*$/;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** What one source holds by name: ids (snake_case keys and identifiers in code, and whole-literal ids; comments and prose aside),
    display names (a literal after an `n:` or `name:` key) and every literal's text. */
export function refsOf(src) {
  const s = String(src || '');
  const ids = new Set(), names = new Set(), literals = new Set();
  let code = '', last = 0;
  for (const m of s.matchAll(LEX)) {
    code += s.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[1]) { code += ' '; continue; }
    const text = m[2].slice(1, -1).replace(/\\(.)/g, '$1');
    literals.add(text.trim());
    if (SNAKE.test(text)) ids.add(text);
    if (NAME_KEY.test(code.slice(-24)) && /[A-Za-z]/.test(text) && !text.includes('${')) names.add(text.trim());
    code += ' "" ';
  }
  code += s.slice(last);
  for (const t of code.match(SNAKE_IN_CODE) || []) ids.add(t);
  return { ids, names, literals };
}

/** What a range cut from src/data: the ids and display names base's copy of a changed file held that head's src/data holds nowhere
    (no key, identifier or whole literal for an id; no literal for a name). */
export function cutRefs(baseChanged, headAll) {
  const nowIds = new Set(), nowLiterals = new Set();
  for (const src of headAll.values()) { const r = refsOf(src); r.ids.forEach((x) => nowIds.add(x)); r.literals.forEach((x) => nowLiterals.add(x)); }
  const ids = new Set(), names = new Set();
  for (const src of baseChanged.values()) {
    const r = refsOf(src);
    for (const x of r.ids) if (!nowIds.has(x) && !nowLiterals.has(x)) ids.add(x);
    for (const x of r.names) if (x.length >= 3 && !nowLiterals.has(x)) names.add(x);
  }
  return { ids, names };
}

/** The cut ids and names `text` names, in cut order: [] when none. A many-word name matches in any case, a one-word name only as
    written; a plural or possessive counts. `keep` holds head's names that contain a cut one ("Dragon Stew Pot" when Dragon Stew was
    cut): they are read past, never a mention. */
export function namesCut(text, cut, keep = []) {
  let s = String(text || '');
  for (const k of keep) s = s.replace(new RegExp(esc(k), 'gi'), ' ');
  const hits = [];
  for (const id of cut.ids) if (new RegExp(`(?<![\\w])${esc(id)}(?![\\w])`).test(s)) hits.push(id);
  for (const n of cut.names) if (new RegExp(`(?<![\\w])${esc(n)}(?:'?s)?(?![\\w])`, /\s/.test(n) ? 'i' : '').test(s)) hits.push(n);
  return hits;
}

/** Every player line at head that names what the range cut: a line already listed gets the flag, an unchanged one is listed as
    ORPHAN. `headRows` are the text tables' rows ([[surface.key, text]]); every other src/data file's prose literals are read whole.
    Returns what was cut and how many ORPHAN lines were added. */
export function orphanEntries(entries, { baseChanged, headAll, headRows }) {
  const cut = cutRefs(baseChanged, headAll);
  if (!cut.ids.size && !cut.names.size) return { cut, added: 0 };
  const headNames = new Set();
  for (const src of headAll.values()) refsOf(src).names.forEach((x) => headNames.add(x));
  const keep = [...headNames].filter((h) => [...cut.names].some((n) => h.length > n.length && h.toLowerCase().includes(n.toLowerCase())))
    .sort((a, b) => b.length - a.length);
  const lines = headRows.map(([id, text]) => ({ id, text }));
  for (const [f, src] of [...headAll].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!f.startsWith(TEXT_DIR)) for (const l of proseLiterals(src)) lines.push({ id: `${f}:${l.line}`, text: l.text });
  }
  const listed = new Map();
  for (const e of entries) if (e.kind !== 'CUT') listed.set(e.id, [...(listed.get(e.id) || []), e]);
  let added = 0;
  for (const l of lines) {
    const flags = namesCut(l.text, cut, keep).map((h) => `names cut "${h}"`);
    if (!flags.length) continue;
    const same = (listed.get(l.id) || []).filter((e) => e.text === l.text);
    for (const e of same) e.flags = [...new Set([...(e.flags || []), ...flags])];
    if (same.length) continue;
    entries.push({ kind: 'ORPHAN', id: l.id, text: l.text, flags: [...autoFlags(l.text), ...flags] });
    added++;
  }
  return { cut, added };
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

/** Every player line base..head touched, plus every unchanged one naming what the range cut, each with its auto flags. `cwd` is
    the repo (the selftest's fixture, or the tree). Returns { entries, baseSha, headSha, cut }. */
export async function collect(base, { head = 'HEAD', cwd } = {}) {
  const git = gitIn(cwd);
  const show = (ref, path) => { try { return git(['show', `${ref}:${path}`]); } catch { return null; } };
  git(['rev-parse', '--verify', `${base}^{commit}`]);
  git(['rev-parse', '--verify', `${head}^{commit}`]);
  const headSha = git(['rev-parse', '--short', `${head}^{commit}`]).trim();
  const baseSha = git(['rev-parse', '--short', `${base}^{commit}`]).trim();
  const files = new Set([...git(['ls-tree', '--name-only', head, TEXT_DIR]).split('\n'),
    ...git(['ls-tree', '--name-only', base, TEXT_DIR]).split('\n')].filter((f) => f.endsWith('.js') && !f.endsWith(REGISTRY)));
  const entries = [];
  const headRows = [];
  for (const f of [...files].sort()) {
    const surface = f.slice(TEXT_DIR.length, -3);
    const now = await rowsOf(surface, show(head, f));
    headRows.push(...now);
    entries.push(...diffRows(await rowsOf(surface, show(base, f)), now));
  }
  for (const l of changelogLines(show(base, 'CHANGELOG.md'), show(head, 'CHANGELOG.md'))) entries.push({ kind: 'CHANGELOG', ...l });
  const notes = git(['diff', '--name-only', base, head, '--', '.claude']).split('\n').filter((f) => /(^|\/)notes-v[^/]*\.md$/.test(f));
  for (const f of notes) for (const l of addedLines(git(['diff', '-U0', base, head, '--', f]), f)) entries.push({ kind: 'NOTES', ...l });
  const changed = git(['diff', '--name-only', base, head, '--', DATA_DIR]).split('\n').filter((f) => f.endsWith('.js')).sort();
  for (const f of changed.filter((x) => !x.startsWith(TEXT_DIR))) {
    entries.push(...dataLines(show(base, f), show(head, f), git(['diff', '-U0', base, head, '--', f]), f));
  }
  for (const e of entries) if (e.kind !== 'CUT') e.flags = autoFlags(e.text);
  const headFiles = git(['ls-tree', '-r', '--name-only', head, DATA_DIR]).split('\n').filter((f) => f.endsWith('.js'));
  const { cut } = orphanEntries(entries, { baseChanged: showAll(cwd, base, changed), headAll: showAll(cwd, head, headFiles), headRows });
  return { entries, baseSha, headSha, cut };
}

async function list(base, outPath, head = 'HEAD') {
  const { entries, baseSha, headSha, cut } = await collect(base, { head });
  const flagged = entries.filter((e) => e.flags && e.flags.length);
  const out = outPath || join(tmpdir(), `player-read-${baseSha}..${headSha}.txt`);
  const lines = [
    `# PLAYER READ ${baseSha}..${headSha}: ${entries.length} line(s) a player will read that are new, changed or cut, or name what was cut.`,
    '# Judge each NEW, CHANGED, DATA, ORPHAN, CHANGELOG and NOTES line against the rubric (node tools/player-read.local.mjs --rubric).',
    '# Any "no": write FLAG and the reason at the start of its line. A flagged line blocks the release until rewritten.',
    '# FLAG(auto: ...) lines use a word from OLD_WORDS / OLD_PHRASES, or name something the range cut: rewrite them before a reader starts.',
    '# ORPHAN lines did not change, but name an id or a name the range took out of src/data.',
    `# Cut in this range: ${[...cut.names, ...cut.ids].join(', ') || 'nothing'}`,
    '# Never judge lines you wrote. {name} is a placeholder the game fills in.',
    '',
  ];
  writeFileSync(out, lines.concat(entries.map(render)).join('\n') + '\n');
  const by = (k) => entries.filter((e) => e.kind === k).length;
  console.log(`player-read ${baseSha}..${headSha}: ${by('NEW')} new, ${by('CHANGED')} changed, ${by('DATA')} data, ${by('CUT')} cut, `
    + `${by('ORPHAN')} unchanged naming a cut, ${by('CHANGELOG')} changelog, ${by('NOTES')} notes line(s)`);
  for (const e of flagged) console.log(`  FLAG(auto: ${e.flags.join(', ')}) ${e.id}\t${e.text}`);
  console.log(flagged.length ? `  ${flagged.length} line(s) auto-flagged: rewrite them` : '  0 auto-flagged');
  console.log(`  → ${out}`);
  return flagged.length ? 1 : 0;
}

/* THE ORPHAN PROOF (lane/c-guard-batch-142): the parts on their own, then the v0.2.141 cookbook cut replayed in a two-commit fixture
   repo and read through collect(), the path the gate runs. A reader that lists only changed lines, or stops calling the scan, is RED. */
async function orphanSelftest(check) {
  const r = refsOf("export const ITEMS = {\n  dragon_stew: {n:'Dragon Stew', v:780}, // was dragon_pie: {n:'Dragon Pie'}\n"
    + "  'oak_log': {name: \"Oak Log\", label: 'Logs'},\n  why: 'a lone hero keeps the ground',\n};\n");
  check(r.ids.has('dragon_stew') && r.ids.has('oak_log') && !r.ids.has('dragon_pie') && [...r.names].sort().join() === 'Dragon Stew,Oak Log',
    `refsOf: keys and quoted keys are ids, n:/name: values are names; a comment and a label are neither (${[...r.ids]} | ${[...r.names]})`);
  const cut = { ids: new Set(['dragon_stew']), names: new Set(['Dragon Stew', 'Keystone']) };
  check(namesCut('Cooks put it in Dragon Stew', cut).join() === 'Dragon Stew' && namesCut('two dragon stews', cut).join() === 'Dragon Stew'
    && namesCut('the dragon_stew row', cut).join() === 'dragon_stew', 'namesCut: a many-word name in any case, a plural, a bare id');
  check(namesCut('A keystone arch', cut).length === 0 && namesCut('The Keystone opens it', cut).join() === 'Keystone', 'namesCut: a one-word name only as written');
  check(namesCut('Supper from a Dragon Stew Pot', cut, ['Dragon Stew Pot']).length === 0 && namesCut('Dragon Stewart waits', cut).length === 0,
    'namesCut: a longer name head still holds, or a longer word, is not a mention');

  const ITEMS_BASE = "export const ITEMS = {\n  dragon_scale: {n:'Dragon Scale', v:40},\n  dragon_stew: {n:'Dragon Stew', v:780},\n  stew_pot: {n:'Dragon Stew Pot', v:10},\n};\n";
  const DESC = (rows) => `export const ITEM_DESC = {\n  // Dragon Stew is the cook's prize (a comment, never a line)\n${rows.join('\n')}\n};\n`;
  const SCALE = "  'dragon_scale': 'A single scale pried off a dragon. Cooks put it in Dragon Stew',";
  const STEW = "  'dragon_stew': 'A spicy stew of dragon meat. Eat it and your combat skills train faster',";
  const POT = "  'stew_pot': 'A heavy pot for a Dragon Stew Pot supper with friends',";
  const OAK = "  'oak_log': 'A sturdy oak log, sawn into planks or burned for fuel',";
  const UNTOUCHED = {
    'src/data/text/bar.js': "export const BAR_TEXT = Object.freeze({\n  feast: 'Eat a Dragon Stew before a long hunt.',\n  plain: 'Hits your target.',\n});\n",
    'src/data/monsters.js': "export const MONSTERS = { wyrm: { name: 'Wyrm', lore: 'It sleeps on a pot of dragon stew and wakes up angry' } };\n",
  };
  const dir = mkdtempSync(join(tmpdir(), 'player-read-selftest-'));
  const g = (...a) => execFileSync('git', ['-c', 'user.name=player-read', '-c', 'user.email=player-read@selftest.invalid',
    '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...a], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = (files, msg) => {
    for (const [p, s] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), s); }
    g('add', '-A'); g('commit', '-q', '-m', msg);
    return g('rev-parse', 'HEAD').trim();
  };
  try {
    g('init', '-q');
    const base = commit({ ...UNTOUCHED, 'src/data/items.js': ITEMS_BASE,
      'src/data/item-descriptions.js': DESC([SCALE, STEW, POT, OAK, "  'ember_coal': 'A hot coal that keeps a cook fire going',"]) }, 'base');
    /* the cut: Dragon Stew's item row and its own flavour leave; ember_coal's flavour is rewritten to name it (a changed line) */
    const head = commit({ 'src/data/items.js': ITEMS_BASE.replace("  dragon_stew: {n:'Dragon Stew', v:780},\n", ''),
      'src/data/item-descriptions.js': DESC([SCALE, POT, OAK, "  'ember_coal': 'A hot coal for the fire under a dragon stew',"]) }, 'cut');
    const later = commit({ 'src/data/item-descriptions.js': DESC([SCALE, POT, OAK, "  'ember_coal': 'A hot coal for the fire under a pot',"]) }, 'later');
    const got = await collect(base, { head, cwd: dir });
    const orphans = got.entries.filter((e) => e.kind === 'ORPHAN');
    const ids = orphans.map((e) => e.id).sort().join(', ');
    check(ids === 'bar.feast, src/data/item-descriptions.js:3, src/data/monsters.js:1',
      `the cut's unchanged mentions are ORPHAN: a flavour row, a text row, a prose line in a file the range never touched (${ids})`);
    check(orphans.every((e) => e.flags.includes('names cut "Dragon Stew"')), 'each ORPHAN is auto-flagged with the name it says');
    const coal = got.entries.filter((e) => e.id === 'src/data/item-descriptions.js:6');
    check(coal.length === 1 && coal[0].kind === 'DATA' && coal[0].flags.includes('names cut "Dragon Stew"'),
      `a changed line naming the cut keeps its DATA entry and gains the flag, never a second ORPHAN (${coal.map((e) => e.kind).join()})`);
    check(got.cut.names.has('Dragon Stew') && got.cut.ids.has('dragon_stew') && !got.cut.names.has('Dragon Stew Pot') && !got.cut.names.has('Dragon Scale'),
      `the cut is Dragon Stew and dragon_stew, not what stayed (${[...got.cut.names, ...got.cut.ids]})`);
    const after = await collect(head, { head: later, cwd: dir });
    check(!after.entries.some((e) => e.kind === 'ORPHAN') && after.cut.names.size === 0,
      'a later range that cuts nothing lists no ORPHAN, though the old mentions still stand');
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
  await orphanSelftest(check);
  console.log(bad ? `player-read selftest: ${bad} FAILED` : 'player-read selftest: ok');
  return bad ? 1 : 0;
}

/* The CLI runs only as the entry module, so the gate's functions (autoFlags, dataLines) can be imported. */
const args = isMain(import.meta.url) ? process.argv.slice(2) : null;
if (args) try {
  if (args.includes('--rubric')) {
    console.log('PLAYER READ RUBRIC (docs/DESIGN_STANDARDS.md §3 "Tyler\'s voice"). Any "no" flags the line.');
    RUBRIC.forEach((q, i) => console.log(`  ${String(i + 1).padStart(2)}. ${q}`));
    process.exit(0);
  }
  if (args.includes('--selftest')) process.exit(await selftest());
  const valueOf = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
  const base = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out' && args[i - 1] !== '--head');
  if (!base) { console.error('usage: node tools/player-read.local.mjs <base-ref> [--out file] [--head ref] | --rubric | --selftest'); process.exit(2); }
  process.exit(await list(base, valueOf('--out'), valueOf('--head') || 'HEAD'));
} catch (e) { console.error('player-read harness error:', e.message || e); process.exit(2); }
