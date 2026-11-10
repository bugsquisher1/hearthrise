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
// THE GATE (the Coordinator, before every release): a fresh reader, never the author of the lines, answers --rubric for each
// line. A line with any "no" is flagged and blocks the release until it is rewritten.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

const TEXT_DIR = 'src/data/text/';
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
  : `${e.kind.padEnd(8)} ${e.id}\t${e.text}${e.was !== undefined ? `\t(was: ${e.was})` : ''}`);

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
  const out = outPath || join(tmpdir(), `player-read-${baseSha}..${headSha}.txt`);
  const head = [
    `# PLAYER READ ${baseSha}..${headSha}: ${entries.length} line(s) a player will read that are new, changed or cut.`,
    '# Judge each NEW, CHANGED, CHANGELOG and NOTES line against the rubric (node tools/player-read.local.mjs --rubric).',
    '# Any "no": write FLAG and the reason at the start of its line. A flagged line blocks the release until rewritten.',
    '# Never judge lines you wrote. {name} is a placeholder the game fills in.',
    '',
  ];
  writeFileSync(out, head.concat(entries.map(render)).join('\n') + '\n');
  const by = (k) => entries.filter((e) => e.kind === k).length;
  console.log(`player-read ${baseSha}..${headSha}: ${by('NEW')} new, ${by('CHANGED')} changed, ${by('CUT')} cut, ${by('CHANGELOG')} changelog, ${by('NOTES')} notes line(s)`);
  console.log(`  → ${out}`);
  return 0;
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
