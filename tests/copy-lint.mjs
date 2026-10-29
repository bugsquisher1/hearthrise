#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/copy-lint.mjs — PLAYER-FACING COPY READS LIKE A PERSON WROTE IT (b568)
//
//   node tests/copy-lint.mjs             gate: no copy slip in any src string
//   node tests/copy-lint.mjs --report    gate + every finding listed
//   node tests/copy-lint.mjs --selftest  mutation proof (one planted slip per rule)
//   node tests/copy-lint.mjs --prune-names  drop baseline rows whose name was fixed
//                                           (never adds a row: the ratchet only shrinks)
//
// WHY. Tyler, 2026-10-11, after playing: "craft 60 items in all — what? sounds
// like broken english". The slips are a CLASS, not a line: a quantity padded
// with "in all", "a"/"an" in front of a plural item ("an Apprentice Gloves"),
// a "(s)" plural hack, two spaces where one belongs, a "·" glued to a word.
// Each is cheap to write and cheap to catch, so this gate catches them.
//
// WHAT IS SCANNED. Every string and template literal in src/**/*.js (comments
// skipped by a small tokenizer; `${…}` holes become a placeholder), except the
// vendored bundle and the in-page test suite, whose strings are fixtures.
//
// THE RULES (each one a pattern a native reader trips over):
//   in-all        "<n> <things> in all"            → drop "in all"
//   plural-hack   "item(s)" / "worker(s)"          → pluralise for real
//   article       "a"/"an" before a plural item    → no article, or "a pair of"
//                 name from src/data/items.js
//   double-space  two spaces between words         → one
//   dot-spacing   "·" touching a word on one side  → " · "
//   spelling      a British form (armour, colour, centre, grey, favourite,
//                 defence, cancelled, -ise…) — player copy is American
//                 (Tyler 2026-10-28); one-word labels are read too, and so is
//                 every CHANGELOG.md entry from v0.2.64 on (the welcome modal's text)
// plus a SHRINK-ONLY RATCHET on filler fantasy words in NAMES (DESIGN_STANDARDS
// §2): Shadow, Void, Ancient, Eternal, Dark, Forgotten (whole word, any case)
// in the `name`/`label`/`title`/`n` field of a data row under src/data/**.
// Prose fields ("it's dark") are not names and are not read. Today's hits are
// pinned in tests/copy-lint-names.baseline.json as "<file>#<name>" → word(s);
// they are renamed as each area is reworked.
//   filler-name   a name not in the baseline (or a new word on a pinned name)
//   stale-name    a pinned name that no longer exists — drop its row
//                 (--prune-names), so the baseline can never grow back
//
// Exit: 0 green · 1 a slip found · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const HERE_ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const argv = process.argv.slice(2);

const SKIP = [
  /[\\/]vendor[\\/]/,
  /[\\/]features[\\/]smoke[\\/]/,
  /[\\/]features[\\/]smoke-test(-loader)?\.js$/,
];

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.js') && !SKIP.some((re) => re.test(p))) out.push(p);
  }
  return out;
}

/* A small JS tokenizer: enough to tell a comment from a string from a regex
   literal. Yields { text, at } (at = source offset) for every string/template literal. Template
   holes are replaced by "§" so "${n} items in all" is still read as copy. */
export function stringLiterals(src) {
  const out = [];
  const n = src.length;
  const REGEX_AFTER_WORD = /^(return|typeof|case|in|of|void|delete|throw|new|else|do|yield|await)$/;

  /* Scan code from `i`. With `hole` set, stop at the `}` that closes a
     template hole and return the index just past it. Template holes are code,
     so they are scanned by this same function (a regex or a quote inside a
     hole must not open a string). */
  function code(i, hole) {
    let prev = '';      // '' | 'a' (operand) | an operator char
    let word = '';
    let depth = 0;
    while (i < n) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
      if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? n : j + 2; continue; }
      if (hole) {
        if (c === '{') depth++;
        else if (c === '}') { if (depth === 0) return i + 1; depth--; }
      }
      if (c === '\'' || c === '"') {
        const start = i; let j = i + 1, s = '';
        while (j < n && src[j] !== c) { if (src[j] === '\\') { s += src[j + 1] === 'n' ? '\n' : src[j + 1]; j += 2; continue; } if (src[j] === '\n') break; s += src[j]; j++; }
        out.push({ text: s, at: start }); i = j + 1; prev = 'a'; word = ''; continue;
      }
      if (c === '`') {
        const start = i; let j = i + 1, s = '';
        while (j < n && src[j] !== '`') {
          if (src[j] === '\\') { s += src[j + 1]; j += 2; continue; }
          if (src[j] === '$' && src[j + 1] === '{') { j = code(j + 2, true); s += '§'; continue; }
          s += src[j]; j++;
        }
        out.push({ text: s, at: start }); i = j + 1; prev = 'a'; word = ''; continue;
      }
      if (c === '/' && (prev !== 'a' || REGEX_AFTER_WORD.test(word))) {
        let j = i + 1, inClass = false;
        while (j < n && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true; else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) break;
          j++;
        }
        i = j + 1; prev = 'a'; word = ''; continue;
      }
      if (/[A-Za-z0-9_$]/.test(c)) { word = (/[A-Za-z0-9_$]/.test(src[i - 1] || '') ? word : '') + c; prev = 'a'; }
      else if (/[)\]]/.test(c)) { prev = 'a'; word = ''; }
      else if (!/\s/.test(c)) { prev = c; word = ''; }
      i++;
    }
    return i;
  }
  code(0, false);
  return out;
}

/* Plural item names: the LAST word of a catalogue name is a plural-only noun. */
const PLURAL_HEADS = new Set(['Gloves', 'Boots', 'Studs', 'Gauntlets', 'Greaves', 'Chaps', 'Vambraces',
  'Slippers', 'Arrows', 'Platelegs', 'Earrings', 'Irons', 'Bones', 'Drops', 'Shears', 'Tongs', 'Leggings',
  'Bracers', 'Runes', 'Seeds', 'Chips', 'Trousers', 'Sabatons']);
export function isPluralName(name) {
  const last = String(name || '').trim().split(/\s+/).pop();
  return PLURAL_HEADS.has(last);
}

/* Every catalogue name, read from the live ITEMS table (generated ladders
   included — "Bronze Gauntlets" is never a literal in the source). */
async function itemNames(root) {
  const mod = await import(pathToFileURL(join(root, 'src', 'data', 'items.js')).href);
  return [...new Set(Object.values(mod.ITEMS).map((i) => i && i.n).filter(Boolean))];
}

export function prose(text) {
  // Only lines that read as words: at least two words of letters.
  return /[A-Za-z]{2,}[ ,.;:!?'’—-]+[A-Za-z]{2,}/.test(text) || /·/.test(text);
}

/* Developer text is not copy: a literal inside a console.* call, an Error, or
   a catalogue's `formula`/`where` field never reaches a player. Read from the
   statement the literal sits in (back to the last ; { or }). */
export function devOnly(src, at) {
  const back = src.slice(Math.max(0, at - 600), at);
  const stmt = back.slice(Math.max(back.lastIndexOf(';'), back.lastIndexOf('{'), back.lastIndexOf('}')) + 1);
  if (/console\.\w+\(|Error\(|\blog\(|blockers\.push\(/.test(stmt)) return true;
  return /["']?\b(formula|where)["']?\s*:\s*$/.test(back);
}

/* One alternation for every plural name, compiled once per scan. */
export function pluralArticleRe(plurals) {
  if (!plurals || !plurals.length) return null;
  const alt = plurals.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp('\\b[Aa]n? (?:' + alt + ')\\b');
}

export function lintText(text, pluralRe) {
  const hits = [];
  const t = text.replace(/<[^>]*>/g, ' \u0000 ');   // tags are not copy; keep a gap marker
  /* also a literal glued to the number before it ("' + n + ' heroes in all'", "' in all'"): it starts with the space */
  if (/\b\d[\d,]*\s+[a-z]+(\s+[a-z]+)?\s+in all\b|§\s+[a-z]+(\s+[a-z]+)?\s+in all\b|^\s+(?:[a-z]+\s+){0,2}in all\b/i.test(t)) hits.push('in-all');
  if (/[A-Za-z]\(s\)/.test(t)) hits.push('plural-hack');
  const segs = t.split('\u0000');
  if (segs.some((seg) => !/\n/.test(seg) && /[A-Za-z0-9.,!?;:’']  +[A-Za-z0-9(]/.test(seg))) hits.push('double-space');
  if (segs.some((seg) => /[A-Za-z0-9)%]·|·[A-Za-z0-9(]/.test(seg))) hits.push('dot-spacing');
  if (pluralRe && pluralRe.test(t)) hits.push('article');
  if (britishWords(t).length) hits.push('spelling');
  return hits;
}

/* AMERICAN SPELLING in player copy (Tyler 2026-10-28: "centre in the change
   log? Center."). A British form read as a whole word — not part of an id,
   a path, a class or a selector ("armour-weights.js", `[data-combat="defence"]`
   stay silent: code names are not copy). The fix is the American form. */
export const BRITISH_RE = new RegExp('(?<![-\\w/.$])(?:'
  + 'armour(?:s|ed|ing|er|ers|y)?|colour(?:s|ed|ful|ing|less)?|centre[sd]?|jeweller(?:y|s)?'
  + '|grey(?:s|ed|ish|er)?|favourite[s]?|honour(?:s|ed|able|ing)?|behaviour(?:s|al)?|(?:centi|kilo|milli)?metre[s]?'
  + '|travell(?:ing|ed|er|ers)|cancell(?:ed|ing)|levell(?:ed|ing|er|ers)|labell(?:ed|ing)|defence[s]?|offence[s]?'
  + '|practis(?:e|ed|es|ing)|plough(?:s|ed|ing)?|mould(?:s|ed|ing|y|ering)?|storey[s]?|smoulder(?:s|ed|ing)?'
  + '|sombre|savoury|rumour[s]?|flavour(?:s|ed|ful)?|valour|vapour[s]?|harbour(?:s|ed)?|labour(?:s|ed|er)?'
  + '|neighbour(?:s|ing|hood)?|odour[s]?|splendour|theatre[s]?|fibre[s]?|sabre[s]?|lustre|spectre[s]?|sceptre[s]?'
  + '|paralys(?:e|ed|es|ing)|analys(?:e|ed|es|ing)|sulphur|prised'
  + '|(?:organi|recogni|reali|apologi|prioriti|customi|finali|minimi|maximi|optimi|summari|speciali|visuali'
  + '|authori|categori|carameli|personali|standardi|memori|critici|stabili|neutrali|normali|utili|crystalli'
  + '|materiali|mobili|immobili|sympathi|energi|harmoni|fertili|sterili|weaponi)s(?:e|ed|es|ing|ation|ations)'
  + ')(?![-\\w/])', 'gi');
export function britishWords(text) {
  const t = String(text).replace(/<[^>]*>/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  return [...t.matchAll(BRITISH_RE)].map((m) => m[0]);
}

/* THE CHANGELOG IS PLAYER TEXT TOO (the welcome modal reads it; the Discord note is cut from it): every entry from
   CHANGELOG_FROM on is read for British spelling, `code` and link targets skipped. Older entries are history and are
   left as they shipped (Tyler 2026-10-28: the sweep starts at v0.2.64). */
export const CHANGELOG_FROM = '0.2.64';
const semver = (v) => v.split('.').map(Number);
const atLeast = (v, from) => { const a = semver(v), b = semver(from); for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]; return true; };
export function changelogFindings(text, file = 'CHANGELOG.md') {
  const out = [];
  let on = false;
  String(text).split(/\r?\n/).forEach((line, i) => {
    const h = /^## v(\d+\.\d+\.\d+)\b/.exec(line);
    if (h) on = atLeast(h[1], CHANGELOG_FROM);
    if (!on) return;
    const words = britishWords(line.replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']'));
    if (words.length) out.push({ file, line: i + 1, rule: 'spelling', text: words.join(', ') + ' — ' + line.slice(0, 90) });
  });
  return out;
}

/* A waiver is one known literal the next edge deploy removes (edge-bundled
   files move only with that deploy). A waiver that no longer matches is stale
   and fails the gate, so it is deleted the day its fix lands. */
const WAIVERS = [];
const usedWaivers = new Set();
function waived(root, f, rule, text) {
  const rel = relative(root, f).split(sep).join('/');
  const w = WAIVERS.find((x) => x.file === rel && x.rule === rule && text.includes(x.text));
  if (w) usedWaivers.add(w);
  return !!w;
}

/* opts.files: scan only these files (the selftest's plants); opts.article: the
   article helper to exercise (default src/render/article.js under root). */
export async function scan(root, opts = {}) {
  const files = opts.files || walk(join(root, 'src'));
  const plurals = (await itemNames(root)).filter(isPluralName);
  const pluralRe = pluralArticleRe(plurals);
  const findings = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const { text, at } of stringLiterals(src)) {
      if (devOnly(src, at)) continue;
      /* A one-word label ("Armour", ' colour ') is copy too for spelling: a
         capitalised word or one with a space round it. A bare lower-case
         token ('armour', 'armour/helm') is an id, never read. */
      const rules = prose(text) ? lintText(text, pluralRe)
        : (/^[A-Z]|\s/.test(text) && britishWords(text).length ? ['spelling'] : []);
      if (!rules.length) continue;
      const line = src.slice(0, at).split('\n').length;
      for (const rule of rules) {
        if (waived(root, f, rule, text)) continue;
        findings.push({ file: relative(root, f).split(sep).join('/'), line, rule, text: text.replace(/\s+/g, ' ').slice(0, 110) });
      }
    }
  }
  if (!opts.files) for (const w of WAIVERS) if (!usedWaivers.has(w)) findings.push({ file: w.file, line: 0, rule: 'stale-waiver', text: w.text });
  usedWaivers.clear();
  return { files: files.length, plurals: plurals.length, findings };
}

/* ── Filler words in names (shrink-only ratchet) ─────────────────────── */
export const FILLER_RE = /\b(shadow|void|ancient|eternal|dark|forgotten)\b/gi;
const NAME_KEY_RE = /(?:^|[{,\s])["']?(?:name|label|title|n)["']?\s*:\s*$/;
export const NAMES_BASELINE = join(HERE_ROOT, 'tests', 'copy-lint-names.baseline.json');

export function fillerWords(text) {
  const w = [...String(text).matchAll(FILLER_RE)].map((m) => m[1][0].toUpperCase() + m[1].slice(1).toLowerCase());
  return [...new Set(w)].sort().join(',');
}

/* Every name-field literal in the given files that carries a filler word:
   Map("<rel file>#<name>" → { words: "Word[,Word]", line }). Keyed by the name
   text, not the line, so moving a row never reads as new or stale. */
export function fillerNames(root, files) {
  const hits = new Map();
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(root, f).split(sep).join('/');
    for (const { text, at } of stringLiterals(src)) {
      if (!NAME_KEY_RE.test(src.slice(Math.max(0, at - 40), at))) continue;
      const words = fillerWords(text);
      if (!words) continue;
      const id = `${rel}#${text}`;
      if (!hits.has(id)) hits.set(id, { words, line: src.slice(0, at).split('\n').length });
    }
  }
  return hits;
}

export function readNamesBaseline(path = NAMES_BASELINE) {
  return JSON.parse(readFileSync(path, 'utf8')).hits || {};
}

/* New hits fail; a pinned row that no longer matches fails as stale. */
export function nameFindings(hits, baseline, checkStale = true) {
  const out = [];
  for (const [id, { words, line }] of hits) {
    if (baseline[id] === words) continue;
    const file = id.slice(0, id.indexOf('#'));
    out.push({ file, line, rule: 'filler-name', text: `${id.slice(file.length + 1)} (${words}) — pick a concrete name (DESIGN_STANDARDS §2)` });
  }
  if (checkStale) for (const [id, words] of Object.entries(baseline)) {
    if (hits.has(id) && hits.get(id).words === words) continue;
    const file = id.slice(0, id.indexOf('#'));
    out.push({ file, line: 0, rule: 'stale-name', text: `${id.slice(file.length + 1)} (${words}) — renamed: drop the row (--prune-names)` });
  }
  return out;
}

function dataNames(root) { return fillerNames(root, walk(join(root, 'src', 'data'))); }

/* Drops fixed rows only; a row is never added here, so the baseline can only shrink. */
function pruneNames(root) {
  const doc = JSON.parse(readFileSync(NAMES_BASELINE, 'utf8'));
  const hits = dataNames(root);
  const kept = {};
  for (const [id, words] of Object.entries(doc.hits)) if (hits.has(id) && hits.get(id).words === words) kept[id] = words;
  const dropped = Object.keys(doc.hits).length - Object.keys(kept).length;
  doc.hits = kept;
  writeFileSync(NAMES_BASELINE, JSON.stringify(doc, null, 2) + '\n');
  console.log(`copy-lint --prune-names: dropped ${dropped} row(s), ${Object.keys(kept).length} pinned`);
  return 0;
}

async function gate(root, report) {
  const { files, plurals, findings } = await scan(root);
  const baseline = readNamesBaseline();
  findings.push(...nameFindings(dataNames(root), baseline));
  findings.push(...changelogFindings(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')));
  if (report || findings.length) for (const f of findings) console.log(`  ${f.rule.padEnd(12)} ${f.file}:${f.line}  ${f.text}`);
  console.log(`copy-lint: ${files} files, ${plurals} plural item names, ${Object.keys(baseline).length} pinned filler name(s), ${findings.length} slip(s)`);
  return findings.length ? 1 : 0;
}

/* Mutation proof: the real tree must be green; then one slip per rule is
   planted in a temp file and each rule must fire on it; a comment carrying the
   same slips must stay silent; and the pre-b568 vowel-only article helper must
   be caught by the runtime rule. */
async function selftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'copy-lint-'));
  let bad = 0;
  try {
    const clean = await scan(HERE_ROOT);
    clean.findings.push(...nameFindings(dataNames(HERE_ROOT), readNamesBaseline()));
    if (clean.findings.length) { console.log(`  selftest: the real tree is not green (${clean.findings.length})`); bad++; }
    const plant = join(tmp, '__copy_lint_plant.js');
    const cases = [
      ['in-all', "export const a = { label: 'Smith 60 items in all' };"],
      ['in-all', "export const a = 'Costs 9 gold, up to ' + n + ' heroes in all.';"],
      ['in-all', "export const a = pct + '% less XP lost' + (t > 1 ? ' in all' : '');"],
      ['plural-hack', "export const a = `${n} item(s) left in your bag`;"],
      ['article', "export const a = 'Craft an Apprentice Gloves first';"],
      ['double-space', "export const a = 'Your crops are  ready to pick';"],
      ['dot-spacing', "export const a = 'Lv 3 ·4h grow';"],
      ['spelling', "export const a = 'Requires Defence 30 to wear';"],
      ['spelling', "export const TIP = { absorb: 'Heavy armour: the share of every blow it takes.' };"],
      ['spelling', "export const a = [{ key: 'armor', label: 'Armour' }];"],
      ['spelling', "export const a = r + ' colour ' + i;"],
      ['spelling', "export const a = 'Pick your favourite grey cloak from the centre rack';"],
      ['spelling', "export const a = 'Organise the bag: it was cancelled while travelling';"],
    ];
    for (const [rule, body] of cases) {
      writeFileSync(plant, '// planted\n' + body + '\n');
      const r = await scan(HERE_ROOT, { files: [plant] });
      const hit = r.findings.some((f) => f.rule === rule && f.file.endsWith('__copy_lint_plant.js'));
      console.log(`  ${hit ? 'caught' : 'MISSED'}  ${rule}`);
      if (!hit) bad++;
    }
    // The CHANGELOG: an entry from CHANGELOG_FROM on is read (the real file is green), an older one is history,
    // and a British word in `code` or a link target is not copy.
    const log = (v) => '# Changelog\n\n## v' + v + ' — 2026-10-30 (Colors)\n\n**Armor.** The grey cloak is your favourite.\n`armour-weights.js` [notes](docs/armour.md)\n';
    const cl = [changelogFindings(readFileSync(join(HERE_ROOT, 'CHANGELOG.md'), 'utf8')).length === 0,
      changelogFindings(log('0.2.65')).length === 1 && /grey, favourite/.test(changelogFindings(log('0.2.65'))[0].text),
      changelogFindings(log('0.2.63')).length === 0];
    for (const [ok, what] of [[cl[0], 'the CHANGELOG is green'], [cl[1], 'spelling in a CHANGELOG entry from ' + CHANGELOG_FROM], [cl[2], 'an older CHANGELOG entry is left as it shipped']]) {
      console.log(`  ${ok ? 'ok    ' : 'FAILED'}  ${what}`);
      if (!ok) bad++;
    }
    // Code names are not copy: an id, an import path, a selector, a class.
    writeFileSync(plant, "import { W } from './armour-weights.js';\nexport const a = ['armour', 'armour/helm', '[data-combat=\"defence\"] b', '<i class=\"hw-tip-flavour\">Gray wool</i>', 'Hearthrise rises at sunrise'];\n");
    const ids = await scan(HERE_ROOT, { files: [plant] });
    const idLeak = ids.findings.some((f) => f.rule === 'spelling');
    console.log(`  ${idLeak ? 'FALSE-POSITIVE' : 'ignored'}  spelling in ids / paths / selectors / classes`);
    if (idLeak) bad++;
    // A comment is not copy.
    writeFileSync(plant, "/* 'Smith 60 items in all' */\n// 'item(s)' 'an Apprentice Gloves'\nexport const a = 1;\n");
    const c = await scan(HERE_ROOT, { files: [plant] });
    const leaked = c.findings.some((f) => f.file.endsWith('__copy_lint_plant.js'));
    console.log(`  ${leaked ? 'FALSE-POSITIVE' : 'ignored'}  comment`);
    if (leaked) bad++;
    // Filler names: a new filler name goes red; the same words in a prose
    // field stay silent; a stale baseline row goes red.
    writeFileSync(plant, "export const M = { wolf: { name: 'Eternal Shadow Wolf', desc: 'It hunts where it is dark and forgotten.' } };\n");
    const nh = fillerNames(HERE_ROOT, [plant]);
    const newHit = nameFindings(nh, readNamesBaseline(), false)
      .some((f) => f.rule === 'filler-name' && f.text.startsWith('Eternal Shadow Wolf (Eternal,Shadow)'));
    console.log(`  ${newHit ? 'caught' : 'MISSED'}  filler-name (new name)`);
    if (!newHit) bad++;
    const prosy = nh.size !== 1;
    console.log(`  ${prosy ? 'FALSE-POSITIVE' : 'ignored'}  filler word in a prose field`);
    if (prosy) bad++;
    const stale = nameFindings(dataNames(HERE_ROOT), { ...readNamesBaseline(), 'src/data/monsters.js#Forgotten Ghoul': 'Forgotten' });
    const staleHit = stale.some((f) => f.rule === 'stale-name' && f.text.startsWith('Forgotten Ghoul'));
    console.log(`  ${staleHit ? 'caught' : 'MISSED'}  stale-name (baseline row with no name behind it)`);
    if (!staleHit) bad++;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(bad ? `copy-lint selftest: ${bad} FAILED` : 'copy-lint selftest: every rule bites');
  return bad ? 1 : 0;
}

if (isMain(import.meta.url)) {
  try {
    process.exit(argv.includes('--selftest') ? await selftest()
      : argv.includes('--prune-names') ? pruneNames(HERE_ROOT)
      : await gate(HERE_ROOT, argv.includes('--report')));
  } catch (e) { console.error('copy-lint harness error:', e); process.exit(2); }
}
