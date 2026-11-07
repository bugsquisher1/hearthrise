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
// THE VOICE (Discord playtest 2026-11-05, Andy: "so many ; in the text are a dead
// giveaway of AI writing", "pays" for XP, "...fits you"; Tyler: "we are getting
// absolutely flamed for the wording"). Read on the words: tags, HTML entities
// (&lsaquo;) and a CSS declaration list are not prose.
//   semicolon     a ";" in copy                   → two sentences, or "and"/"so"
//   em-dash       a "—" in copy (a name/label field's "Room — Rung" is a label)
//                                                 → a period or a comma
//   pays-xp       "pays (more) Level XP", also across "' pays ' + n + ' more XP'"
//                                                 → "earns"; gold is what pays
//   fits-you      "<ground> fits you(r Level)" in a sentence, and the list
//                 tag "Fits your level"           → "is right for", "awaits"
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

import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
  'Bracers', 'Runes', 'Seeds', 'Chips', 'Trousers', 'Sabatons', 'Salts']);
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

/* Developer text is not copy: a literal inside a console.* call, an Error, a
   validator's message (`problems.push(`, `bad(`), or a catalogue's documentation
   field (`formula`, `where`, and the price catalogue's `server_needs` /
   `spends_at` / `anchor` / `origin`) never reaches a player. Read from the
   statement the literal sits in (back to the last ; { or }). */
export function devOnly(src, at) {
  const back = src.slice(Math.max(0, at - 600), at);
  const stmt = back.slice(Math.max(back.lastIndexOf(';'), back.lastIndexOf('{'), back.lastIndexOf('}')) + 1);
  if (/console\.\w+\(|Error\(|\blog\(|blockers\.push\(|problems\.push\(|\bbad\(/.test(stmt)) return true;
  return /["']?\b(formula|where|server_needs|spends_at|anchor|origin)["']?\s*:\s*$/.test(back);
}

/* One alternation for every plural name, compiled once per scan. */
export function pluralArticleRe(plurals) {
  if (!plurals || !plurals.length) return null;
  const alt = plurals.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp('\\b[Aa]n? (?:' + alt + ')\\b');
}

/* THE VOICE rules' patterns (header). `pays` then up to three words of the same
   sentence, then (Level) XP: "every kill pays more XP", "pays 10% more Level XP". */
export const PAYS_XP_RE = /\bpa(?:y|ys|id|ying)\b(?:\s+[^\s.!?;:]+){0,3}?\s+(?:Level\s+)?(?:XP|experience)\b/i;
/* The two halves of "' pays ' + pct + ' more Level XP'": a literal ending on pay(s), the next one starting on (a word or two and) XP. */
export const PAYS_TAIL_RE = /\bpa(?:y|ys|id|ying)\s*$/i;
export const XP_HEAD_RE = /^\s*(?:[^\s.!?;:]+\s+){0,2}(?:Level\s+)?(?:XP|experience)\b/i;
/* A ground or a hunt that "fits you." / "fits your Level", in a sentence, a literal after a name (' fits you.') or a list tag
   ("Fits your level", the Hunts chip the playtest read on Wickstead). A glove that fits your hand is English. */
export const FITS_YOU_RE = /\bfits (?:you(?=\s*[.,;:!?)]|\s*$)|your (?:level|party|group)\b)/i;
/* A CSS declaration list ("display: none; color: red") is code, not a sentence. */
const CSS_LIST_RE = /^\s*(?:-{0,2}[a-z][a-z-]*\s*:\s*[^;:]+;\s*)+(?:-{0,2}[a-z][a-z-]*\s*:\s*[^;:]*)?$/;

/** The voice rules a prose literal breaks. `name`: it is a name/label field (an em dash there is a label's separator). */
export function voiceRules(text, name = false) {
  const w = String(text).replace(/<[^>]*>/g, ' ').replace(/&#?[A-Za-z0-9]+;/g, ' ');
  const hits = [];
  if (/;/.test(w) && !CSS_LIST_RE.test(w)) hits.push('semicolon');
  if (!name && /—/.test(w)) hits.push('em-dash');
  if (PAYS_XP_RE.test(w)) hits.push('pays-xp');
  if (FITS_YOU_RE.test(w)) hits.push('fits-you');
  if (colonJoins(w).length) hits.push('colon-join');
  return hits;
}

/* COLON JOINS (Tyler 2026-11-06, "did you fix all the shitty text"): a clause glued to another by ": " inside a sentence
   ("Creating a hero says there's nothing to choose: your hero owns every weapon"). A LABEL stays: 1 to 3 words before the
   colon in its sentence ("Food: store", "Gold: 12,875 gp", "Next step up: Mosslight Glade"), and so does a colon that
   opens a capitalized value ("Next gear at Level 22: Houndskin Cloak"). Flagged: 4+ words of the same sentence before
   it AND a lower-case word after it. A CSS declaration list is code. Returns the offending clause heads. */
export function colonJoins(text) {
  const w = String(text);
  if (CSS_LIST_RE.test(w)) return [];
  const out = [];
  for (const m of w.matchAll(/:\s+(?=[a-z])/g)) {
    const before = w.slice(0, m.index);
    /* the sentence it sits in: back to a sentence end, a tag gap, an open bracket or an attribute's opening quote */
    const sentence = before.slice(Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '), before.lastIndexOf('\u0000'),
      before.lastIndexOf('('), before.lastIndexOf('="'), -1) + 1);
    const words = sentence.match(/[A-Za-z0-9§][\w'’%,.§-]*/g) || [];
    if (words.length >= 4) out.push(sentence.trim().slice(-60));
  }
  return out;
}

export function lintText(text, pluralRe, name = false) {
  const hits = voiceRules(text, name);
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
    const plain = line.replace(/`[^`]*`/g, ' ').replace(/\]\([^)]*\)/g, ']');
    const words = britishWords(plain);
    if (words.length) out.push({ file, line: i + 1, rule: 'spelling', text: words.join(', ') + ' — ' + line.slice(0, 90) });
    /* THE VOICE on every body line the welcome modal shows (2026-11-06); the `## vX.Y.Z — date (Title)` heading keeps its dash */
    if (!h) for (const rule of voiceRules(plain.replace(/^\s*[-*]\s+/, '').replace(/\*\*/g, ''))) out.push({ file, line: i + 1, rule, text: line.slice(0, 110) });
  });
  return out;
}

/* SERVER-HELD PLAYER TEXT (lane/c-copy-server, 2026-11-06): the SQL functions whose sentences GoTrue or the client hand a
   player word for word. Each is read at its NEWEST definition in apply order (tests/schema-apply-order.json `order`), so a
   restating migration fixes it and an old file's history stays as it shipped. Its quoted strings are read like copy: the
   voice rules and American spelling. A new player-facing SQL function joins this list. */
export const SQL_COPY_FUNCTIONS = Object.freeze(['hr_beta_gate_message', 'hr_beta_signup_message']);
/** `files`: [[name, sql], ...] in apply order. Findings for each listed function's newest body. */
export function sqlCopyFindings(files, fns = SQL_COPY_FUNCTIONS) {
  const out = [];
  for (const fn of fns) {
    const head = new RegExp('create\\s+or\\s+replace\\s+function\\s+public\\.' + fn + '\\s*\\(', 'i');
    const last = [...files].reverse().find(([, sql]) => head.test(sql));
    if (!last) { out.push({ file: 'supabase/migrations', line: 0, rule: 'sql-copy', text: fn + ' is defined by no migration in the apply order' }); continue; }
    const [name, sql] = last;
    const from = sql.search(head);
    const open = /\$([A-Za-z_]*)\$/.exec(sql.slice(from));
    const start = from + open.index + open[0].length;
    const body = sql.slice(start, sql.indexOf(open[0], start)).replace(/--[^\n]*/g, ' ');
    for (const m of body.matchAll(/'((?:[^']|'')*)'/g)) {
      const text = m[1].replace(/''/g, '\'');
      if (!prose(text)) continue;
      const line = sql.slice(0, start + m.index).split('\n').length;
      for (const rule of [...voiceRules(text), ...(britishWords(text).length ? ['spelling'] : [])]) {
        out.push({ file: 'supabase/migrations/' + name, line, rule, text: fn + ': ' + text.slice(0, 100) });
      }
    }
  }
  return out;
}
function chainSql(root) {
  const order = JSON.parse(readFileSync(join(root, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  return order.map((n) => [n, readFileSync(join(root, 'supabase', 'migrations', n), 'utf8').replace(/\r\n/g, '\n')]);
}

/* A waiver is one known literal the next edge deploy removes (edge-bundled
   files move only with that deploy), or a slip the text table UNCOVERED: a
   sentence glued from pieces hid it from these rules, and moving its words into
   src/data/text/ (lane/b-text-home) may not change them, so it waits for Tyler's
   wording review. A waiver that no longer matches is stale and fails the gate,
   so it is deleted the day its fix lands. */
const WAIVERS = [
  /* Uncovered by the move: "Needs a Fire rune for each cast: you carry none." ("' for each cast: '" was its own literal). */
  { file: 'src/data/text/bar.js', rule: 'colon-join', text: 'Needs a § for each cast: you carry none.' },
  { file: 'src/data/text/bar.js', rule: 'colon-join', text: 'Needs an § for each cast: you carry none.' },
  { file: 'src/data/text/bar.js', rule: 'colon-join', text: 'Needs a § for each cast: none in this hunt, and §' },
  { file: 'src/data/text/bar.js', rule: 'colon-join', text: 'Needs an § for each cast: none in this hunt, and §' },
];
const usedWaivers = new Set();
function waived(root, f, rule, text) {
  const rel = relative(root, f).split(sep).join('/');
  const w = WAIVERS.find((x) => x.file === rel && x.rule === rule && text.includes(x.text));
  if (w) usedWaivers.add(w);
  return !!w;
}

/* Every player sentence the windows show lives in src/data/text/ (src/render/player-text.js reads it). */
const TEXT_TABLE_RE = /[\\/]src[\\/]data[\\/]text[\\/][^\\/]+\.js$/;

/* opts.files: scan only these files (the selftest's plants); opts.article: the
   article helper to exercise (default src/render/article.js under root). */
export async function scan(root, opts = {}) {
  const files = opts.files || walk(join(root, 'src'));
  const plurals = (await itemNames(root)).filter(isPluralName);
  const pluralRe = pluralArticleRe(plurals);
  const findings = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const lits = stringLiterals(src);
    /* THE TEXT TABLE (src/data/text/*, lane/b-text-home): a row's {placeholder} is a hole, read like a template's ${…}. */
    const table = TEXT_TABLE_RE.test(f);
    for (let i = 0; i < lits.length; i++) {
      const { at } = lits[i];
      const text = table ? lits[i].text.replace(/\{[a-z][A-Za-z0-9_]*\}/g, '§') : lits[i].text;
      if (devOnly(src, at)) continue;
      /* A one-word label ("Armour", ' colour ') is copy too for spelling: a
         capitalised word or one with a space round it. A bare lower-case
         token ('armour', 'armour/helm') is an id, never read. */
      const name = NAME_KEY_RE.test(src.slice(Math.max(0, at - 40), at));
      const rules = prose(text) ? lintText(text, pluralRe, name)
        : (/^[A-Z]|\s/.test(text) && britishWords(text).length ? ['spelling'] : []);
      /* "' pays ' + pct + ' more Level XP'": the slip split across a join (the next literal, after a + only) */
      const next = lits[i + 1];
      if (next && !rules.includes('pays-xp') && PAYS_TAIL_RE.test(text) && XP_HEAD_RE.test(next.text)
        && /^[^;{}]{0,160}\+\s*$/.test(src.slice(at + 1 + text.length, next.at)) && !devOnly(src, next.at)) rules.push('pays-xp');
      /* THE JOINS (v0.2.100 played: "Iron, Studded, Adept: bodies, legs; Bramble Blade"): a bare "; " or " — " literal glues
         player words together in code (`.join('; ')`, `a + '; ' + b`, `${a}; ${b}`), so no prose literal ever holds the slip.
         A bare ";" or "—" with no space after it is a code token (a map legend, a cache key) or a table's empty cell, and stays quiet. */
      if (!rules.includes('semicolon') && /^\s*;\s+$|§\s*;\s+§/.test(text)) rules.push('semicolon');
      if (!rules.includes('em-dash') && /^\s+—\s+$/.test(text)) rules.push('em-dash');
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
  findings.push(...sqlCopyFindings(chainSql(root)));
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
      ['semicolon', "export const a = 'One house for all your heroes. Gold comes from your purse; materials from your bag.';"],
      ['semicolon', "export const a = 'Bought today: ' + n + '; each one costs more.';"],
      ['semicolon', "export const a = `Defensive takes ${d} less damage; Offensive deals more.`;"],
      ['em-dash', "export const a = { one: 'You ran out of gold for supplies — the hunt ended.' };"],
      ['em-dash', "export const a = 'Buy a hero slot — ' + whole(cost) + ' gold';"],
      ['pays-xp', "export const a = 'Every kill pays Level XP and fills the ring around your Level.';"],
      ['pays-xp', "export const a = 'They cost more food, and every kill pays more XP.';"],
      ['pays-xp', "export const a = 'Each kill pays ' + PCT(t.xpPm) + ' more Level XP, with the same gold.';"],
      ['pays-xp', "export const a = `Each kill pays ${pct} more experience`;"],
      ['fits-you', "export const a = 'Keep hunting until Level 5. Then ' + name + ' fits you. You can close the game.';"],
      ['fits-you', "export const a = HUNT.name + ' fits your Level with a party. ' + how;"],
      ['fits-you', "export function tag(party) { return party ? 'Fits your party' : 'Fits your level'; }"],
      ['semicolon', "export const a = (e) => [e.slots.join(', '), e.weapons.join(', ')].filter(Boolean).join('; ');"],
      ['semicolon', "export const a = (n, u, l) => 'You are missing ' + n + ' ' + u + '; ' + l + ' would be wasted.';"],
      ['semicolon', "export const a = (x, y) => `${x}; ${y}`;"],
      ['em-dash', "export const a = (lv, have) => 'Needs Level ' + lv + ' — ' + have;"],
      ['colon-join', "export const a = 'Creating a hero says there is nothing to choose: your hero owns every weapon.';"],
      ['colon-join', "export const a = (g) => `Hunt again is off: a hunt is already running in ${g}.`;"],
    ];
    for (const [rule, body] of cases) {
      writeFileSync(plant, '// planted\n' + body + '\n');
      const r = await scan(HERE_ROOT, { files: [plant] });
      const hit = r.findings.some((f) => f.rule === rule && f.file.endsWith('__copy_lint_plant.js'));
      console.log(`  ${hit ? 'caught' : 'MISSED'}  ${rule}`);
      if (!hit) bad++;
    }
    // The text table (src/data/text/*): a row's {placeholder} reads as a hole, so "{count} items in all" is a slip
    // there, and the same row anywhere else is not read as one.
    mkdirSync(join(tmp, 'src', 'data', 'text'), { recursive: true });
    const tablePlant = join(tmp, 'src', 'data', 'text', '__copy_lint_table.js');
    const row = "export const T = Object.freeze({ crafted: 'Smith {count} items in all' });\n";
    writeFileSync(tablePlant, row);
    writeFileSync(plant, row);
    const inTable = (await scan(HERE_ROOT, { files: [tablePlant] })).findings.some((f) => f.rule === 'in-all');
    const outside = (await scan(HERE_ROOT, { files: [plant] })).findings.some((f) => f.rule === 'in-all');
    console.log(`  ${inTable && !outside ? 'caught' : 'MISSED'}  a text table row's {placeholder} reads as a number`);
    if (!inTable || outside) bad++;
    // The CHANGELOG: an entry from CHANGELOG_FROM on is read (the real file is green), an older one is history,
    // and a British word in `code` or a link target is not copy.
    const log = (v) => '# Changelog\n\n## v' + v + ' — 2026-10-30 (Colors)\n\n**Armor.** The grey cloak is your favourite.\n`armour-weights.js` [notes](docs/armour.md)\n';
    const cl = [changelogFindings(readFileSync(join(HERE_ROOT, 'CHANGELOG.md'), 'utf8')).length === 0,
      changelogFindings(log('0.2.65')).length === 1 && /grey, favourite/.test(changelogFindings(log('0.2.65'))[0].text),
      changelogFindings(log('0.2.63')).length === 0,
      changelogFindings(log('0.2.65') + '- Trying colors on is free; saving them costs gold.\n- It stays on your bar and says why: it waits.\n').map((x) => x.rule).join() === 'spelling,semicolon,colon-join',
      changelogFindings(log('0.2.63') + '- Trying colors on is free; saving them costs gold.\n').length === 0];
    for (const [ok, what] of [[cl[0], 'the CHANGELOG is green'], [cl[1], 'spelling in a CHANGELOG entry from ' + CHANGELOG_FROM], [cl[2], 'an older CHANGELOG entry is left as it shipped'],
      [cl[3], 'the voice rules in a CHANGELOG entry body from ' + CHANGELOG_FROM + ' (its heading keeps its dash)'], [cl[4], 'the voice rules leave an older entry alone']]) {
      console.log(`  ${ok ? 'ok    ' : 'FAILED'}  ${what}`);
      if (!ok) bad++;
    }
    // Code names are not copy: an id, an import path, a selector, a class.
    writeFileSync(plant, "import { W } from './armour-weights.js';\nexport const a = ['armour', 'armour/helm', '[data-combat=\"defence\"] b', '<i class=\"hw-tip-flavour\">Gray wool</i>', 'Hearthrise rises at sunrise'];\n");
    const ids = await scan(HERE_ROOT, { files: [plant] });
    const idLeak = ids.findings.some((f) => f.rule === 'spelling');
    console.log(`  ${idLeak ? 'FALSE-POSITIVE' : 'ignored'}  spelling in ids / paths / selectors / classes`);
    if (idLeak) bad++;
    // The voice rules read words only: gold that pays, the list's tag, an HTML entity, a CSS list, a label's
    // separator, a validator's message, a price catalogue's notes, and an en dash in a range all stay silent.
    const VOICE = ['semicolon', 'em-dash', 'pays-xp', 'fits-you', 'colon-join'];
    writeFileSync(plant, "export const a = ['Tamsin pays for kills, and in armor too.', 'The Shop pays more for gear than for scraps of XP.', 'Right for your level', 'A glove that fits your hand like its own skin',"
      + " '<button>&lsaquo; All settings</button> and the rest', 'display: none; color: var(--ink)', 'Best with a party of 2–4 heroes',"
      + " 'Food: store, then your own bread', 'Gold: 12,875 gp', 'Next gear at Level 22: Houndskin Cloak', 'Runes: Plain Fire Rune from the store'];\n"
      + "export const R = { id: 'room.cellar.1', name: 'Cellar — Root Cellar', server_needs: 'player_state holds the COUNT; the server prices it — never the client' };\n"
      + "function v(bad) { bad('L-COVER', 'is drawn behind a roof; the hero standing there would be hidden'); }\n"
      + "export const cell = (r) => (r.per === null ? '—' : String(r.per));\n"
      + "export function ev(bad) { if (bad.length) throw new Error('makeEvent: ' + bad.join('; ')); }\n");
    const quiet = await scan(HERE_ROOT, { files: [plant] });
    const loud = quiet.findings.filter((f) => VOICE.includes(f.rule));
    console.log(`  ${loud.length ? 'FALSE-POSITIVE' : 'ignored'}  voice rules on gold, tags, entities, CSS, labels, dev text${loud.length ? ': ' + loud.map((f) => f.rule + ' ' + f.text).join(' | ') : ''}`);
    if (loud.length) bad++;
    // Server-held copy: the newest definition of a listed SQL function is read; an older one is history; a function no file defines is red.
    const sqlBad = "create or replace function public.hr_beta_gate_message(p_reason text)\nreturns text language sql immutable as $$\n  select case p_reason when 'x' then 'That invite code was not recognised. Check it for typos — or ask; we answer fast.' end\n$$;\n";
    const sqlGood = sqlBad.replace('was not recognised. Check it for typos — or ask; we answer fast.', 'was not recognized. Check it for typos, or ask in the Discord.');
    const sqlRed = sqlCopyFindings([['a.sql', sqlBad]], ['hr_beta_gate_message']).map((f) => f.rule).sort().join(',');
    const sqlNewest = sqlCopyFindings([['a.sql', sqlBad], ['b.sql', sqlGood]], ['hr_beta_gate_message']).length;
    const sqlNone = sqlCopyFindings([['b.sql', sqlGood]], ['hr_no_such_copy']).some((f) => f.rule === 'sql-copy');
    const sqlReal = sqlCopyFindings(chainSql(HERE_ROOT)).length;
    const sqlWithoutFix = sqlCopyFindings(chainSql(HERE_ROOT).filter(([n]) => n !== '2027-03-18-invite-refusal-words.sql')).length;
    for (const [ok, what] of [[sqlRed === 'em-dash,semicolon,spelling', 'sql-copy: an em dash, a semicolon and "recognised" in a SQL copy function (' + sqlRed + ')'],
      [sqlNewest === 0, 'sql-copy: only the newest definition is read'], [sqlNone, 'sql-copy: a listed function no migration defines'],
      [sqlReal === 0, 'sql-copy: the real chain is green'], [sqlWithoutFix > 0, 'sql-copy: the chain without 2027-03-18-invite-refusal-words.sql is red (' + sqlWithoutFix + ')']]) {
      console.log(`  ${ok ? 'caught' : 'MISSED'}  ${what}`);
      if (!ok) bad++;
    }
    // A waiver only shelters its own literal: a new slip in an edge-bundled file is red.
    writeFileSync(plant, "export const D = { x: 'Bones and grief. Crush them; poison does nothing to the dead.' };\n");
    const sheltered = (await scan(HERE_ROOT, { files: [plant] })).findings.some((f) => f.rule === 'semicolon');
    console.log(`  ${sheltered ? 'caught' : 'MISSED'}  a waived literal outside its own file`);
    if (!sheltered) bad++;
    // A waiver whose literal is gone (rewritten on the edge lane) goes red until its row is deleted.
    WAIVERS.push({ file: 'src/data/items.js', rule: 'em-dash', text: 'a literal that was rewritten' });
    const staleW = (await scan(HERE_ROOT)).findings.some((f) => f.rule === 'stale-waiver' && f.text === 'a literal that was rewritten');
    WAIVERS.pop();
    console.log(`  ${staleW ? 'caught' : 'MISSED'}  stale-waiver (a fixed literal's row left behind)`);
    if (!staleW) bad++;
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
