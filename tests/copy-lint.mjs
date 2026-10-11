#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/copy-lint.mjs — PLAYER-FACING COPY READS LIKE A PERSON WROTE IT (b568)
//
//   node tests/copy-lint.mjs             gate: no copy slip in any src string
//   node tests/copy-lint.mjs --report    gate + every finding listed
//   node tests/copy-lint.mjs --selftest  mutation proof (one planted slip per rule)
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
//   spelling      "Defence" — the skill catalogue says "Defense"
// plus a RUNTIME check on the one article helper (src/render/article.js):
// withArticle(<every plural item name>) must not answer "a …"/"an …".
//
// Exit: 0 green · 1 a slip found · 2 harness error.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
  if (/\b\d[\d,]*\s+[a-z]+(\s+[a-z]+)?\s+in all\b|§\s+[a-z]+(\s+[a-z]+)?\s+in all\b/i.test(t)) hits.push('in-all');
  if (/[A-Za-z]\(s\)/.test(t)) hits.push('plural-hack');
  const segs = t.split('\u0000');
  if (segs.some((seg) => !/\n/.test(seg) && /[A-Za-z0-9.,!?;:’']  +[A-Za-z0-9(]/.test(seg))) hits.push('double-space');
  if (segs.some((seg) => /[A-Za-z0-9)%]·|·[A-Za-z0-9(]/.test(seg))) hits.push('dot-spacing');
  if (pluralRe && pluralRe.test(t)) hits.push('article');
  if (/\bDefence\b/.test(t)) hits.push('spelling');
  return hits;
}

/* A waiver is one known literal the next edge deploy removes (edge-bundled
   files move only with that deploy). A waiver that no longer matches is stale
   and fails the gate, so it is deleted the day its fix lands. */
const WAIVERS = [
  { file: 'src/core/styles.js', rule: 'spelling', text: 'All XP to Defence' },
];
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
      if (!prose(text) || devOnly(src, at)) continue;
      const rules = lintText(text, pluralRe);
      if (!rules.length) continue;
      const line = src.slice(0, at).split('\n').length;
      for (const rule of rules) {
        if (waived(root, f, rule, text)) continue;
        findings.push({ file: relative(root, f).split(sep).join('/'), line, rule, text: text.replace(/\s+/g, ' ').slice(0, 110) });
      }
    }
  }
  // Runtime: the article helper must not put "a"/"an" before a plural name.
  const artPath = opts.article || join(root, 'src', 'render', 'article.js');
  try {
    const mod = await import(pathToFileURL(artPath).href + '?t=' + Date.now());
    for (const p of plurals) {
      const s = mod.withArticle(p);
      if (/^an? /i.test(s)) { findings.push({ file: 'src/render/article.js', line: 0, rule: 'article', text: `withArticle('${p}') -> '${s}'` }); break; }
    }
  } catch (e) {
    findings.push({ file: 'src/render/article.js', line: 0, rule: 'harness', text: String(e && e.message || e) });
  }
  if (!opts.files) for (const w of WAIVERS) if (!usedWaivers.has(w)) findings.push({ file: w.file, line: 0, rule: 'stale-waiver', text: w.text });
  usedWaivers.clear();
  return { files: files.length, plurals: plurals.length, findings };
}

async function gate(root, report) {
  const { files, plurals, findings } = await scan(root);
  if (report || findings.length) for (const f of findings) console.log(`  ${f.rule.padEnd(12)} ${f.file}:${f.line}  ${f.text}`);
  console.log(`copy-lint: ${files} files, ${plurals} plural item names, ${findings.length} slip(s)`);
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
    if (clean.findings.length) { console.log(`  selftest: the real tree is not green (${clean.findings.length})`); bad++; }
    const plant = join(tmp, '__copy_lint_plant.js');
    const cases = [
      ['in-all', "export const a = { label: 'Smith 60 items in all' };"],
      ['plural-hack', "export const a = `${n} item(s) left in your bag`;"],
      ['article', "export const a = 'Craft an Apprentice Gloves first';"],
      ['double-space', "export const a = 'Your crops are  ready to pick';"],
      ['dot-spacing', "export const a = 'Lv 3 ·4h grow';"],
      ['spelling', "export const a = 'Requires Defence 30 to wear';"],
    ];
    for (const [rule, body] of cases) {
      writeFileSync(plant, '// planted\n' + body + '\n');
      const r = await scan(HERE_ROOT, { files: [plant] });
      const hit = r.findings.some((f) => f.rule === rule && f.file.endsWith('__copy_lint_plant.js'));
      console.log(`  ${hit ? 'caught' : 'MISSED'}  ${rule}`);
      if (!hit) bad++;
    }
    // A comment is not copy.
    writeFileSync(plant, "/* 'Smith 60 items in all' */\n// 'item(s)' 'an Apprentice Gloves'\nexport const a = 1;\n");
    const c = await scan(HERE_ROOT, { files: [plant] });
    const leaked = c.findings.some((f) => f.file.endsWith('__copy_lint_plant.js'));
    console.log(`  ${leaked ? 'FALSE-POSITIVE' : 'ignored'}  comment`);
    if (leaked) bad++;
    // The runtime article rule: the vowel-only helper this build replaced.
    const art = join(tmp, 'article-mutant.mjs');
    writeFileSync(art, "export function withArticle(name){ const s=String(name||'').trim(); return (/^[aeiou]/i.test(s)?'an ':'a ')+s; }\n");
    const r2 = await scan(HERE_ROOT, { files: [], article: art });
    const hit2 = r2.findings.some((f) => f.rule === 'article' && f.file === 'src/render/article.js');
    console.log(`  ${hit2 ? 'caught' : 'MISSED'}  article helper (vowel-only mutant)`);
    if (!hit2) bad++;
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log(bad ? `copy-lint selftest: ${bad} FAILED` : 'copy-lint selftest: every rule bites');
  return bad ? 1 : 0;
}

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  try {
    process.exit(argv.includes('--selftest') ? await selftest() : await gate(HERE_ROOT, argv.includes('--report')));
  } catch (e) { console.error('copy-lint harness error:', e); process.exit(2); }
}
