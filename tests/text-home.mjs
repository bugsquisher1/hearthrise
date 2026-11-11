#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/text-home.mjs — EVERY WORD A PLAYER READS LIVES IN ONE TABLE (lane/b-text-home).
//
//   node tests/text-home.mjs            the gate
//   node tests/text-home.mjs --report   the gate, plus each file's text still written in code
//   node tests/text-home.mjs --write    lower the ratchet's ceilings to today's counts (never raises one)
//   node tests/text-home.mjs --mutate   mutation proof: each planted defect must turn its rule red
//
// mutant-anchors: none — every mutant edits an in-memory copy of the sources or the table
//
// WHY (Tyler 2026-11-07). Player text kept getting flamed (semicolons, "pays XP", "fits you"), and
// hundreds of window sentences were glued from pieces in code, so no one could review, lint or translate
// them. The words now live in src/data/text/* (whole sentences, named placeholders, plural forms) and
// are read through t() (src/render/player-text.js). This guard holds both halves.
//   TH-1  RATCHET: per file under src/shell, src/hunt-view, src/app and src/social, the player-visible
//         string literals still in code (the review page's own tokenizer, playerTexts below) may only go
//         down (tests/text-home.baseline.json); a file not in the baseline holds none. A string a player
//         never reads that looks like one is named in ALLOW with why; a stale ALLOW row is red.
//   TH-2  ROWS: every surface file under src/data/text/ is named in text-table.js; keys are snake_case; a
//         row is a non-empty string, or plural forms ({ one, other }, CLDR names) with `other`; plain text
//         (no tags, no entities); placeholders are {lowerCamel} and no other brace stands in a row.
//   TH-3  CALLS: every t('id') / hasText('id') names a row (with `+` after it: a prefix some row starts
//         with); a vars object written at the call fills every placeholder of every form, gives a plural
//         row its {count}, and names nothing else.
//   TH-4  NO DEAD ROW: every row is named by a call, a prefix or a quoted id somewhere under src.
//   TH-5  NO SHADOW: a file that imports t binds no other `t` (an event handler's `(…, t)` would call
//         the clicked element).
//   TH-6  THE READER: t() fills placeholders, picks plural forms by {count} (1 → one, 0 and 2 → other),
//         and in node throws on a missing row, a missing value or a plural row with no count.
// Exit: 0 green · 1 a rule red · 2 harness error.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { walk, stringLiterals, prose, devOnly } from './copy-lint.mjs';
import { strip } from './_js-strip.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const BASELINE = join(ROOT, 'tests', 'text-home.baseline.json');
const TEXT_DIR = 'src/data/text/';
const REGISTRY = TEXT_DIR + 'text-table.js';
/** The directories whose text moves into the table (the windows, the hunt screen, the start screens, chat). */
export const DIRS = ['src/shell/', 'src/hunt-view/', 'src/app/', 'src/social/'];

/* Strings the tokenizer takes for player text that no player reads. Each names its file, its exact text and why. */
export const ALLOW = Object.freeze([]);

// ── The tokenizer the review page uses (.claude/text-review/extract.mjs imports it) ──────────────────

const ENT = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&apos;': '\'',
  '&lsaquo;': '‹', '&rsaquo;': '›', '&middot;': '·', '&times;': '×', '&hellip;': '…', '&rarr;': '→', '&larr;': '←', '&minus;': '−' };
export const decode = (s) => s.replace(/&[a-z#0-9]+;/gi, (e) => ENT[e.toLowerCase()] ?? e);

/** A code-ish string no player reads: ids, paths, class lists, CSS, SQL, constants, camelCase tokens. */
export function codeish(t) {
  if (/=>|[{}]|\(\)\s*;|;\s*$|^\s*[.#[][\w-]|var\(--|\b\d+(px|rem|em|ms|vh|vw)\b|#[0-9a-f]{3,8}\b|https?:\/\/|^\/|\.(js|css|png|json|svg|webp|mjs)\b/i.test(t)) return true;
  if (/^[a-z0-9_.:/-]+$/.test(t)) return true;
  if (/^[a-z0-9 _-]+$/.test(t) && /[-_]/.test(t)) return true;
  if (/\b(select|insert|update|delete)\b.+\b(from|into|set|where)\b/i.test(t) && /[a-z]_[a-z]/.test(t)) return true;
  if (/^[A-Z0-9_]+$/.test(t)) return true;
  if (/[a-z][A-Z]/.test(t) && !/\s/.test(t)) return true;
  return false;
}

const ATTR = /\b(?:title|aria-label|placeholder|alt|data-tip)\s*=\s*"([^"]*)"/gi;
const squash = (s) => s.replace(/\s+/g, ' ').trim();

/** The pieces of one literal a player reads ("§" = a template hole, written "{…}"): attribute texts, then the text between tags. */
export function playerParts(raw) {
  const s = raw.replace(/§/g, '{…}');
  const out = [];
  for (const m of s.matchAll(ATTR)) { const v = decode(m[1]).trim(); if (v && /[A-Za-z]{2,}/.test(v) && !codeish(v)) out.push(squash(v)); }
  for (let part of /<[a-z!/]/i.test(s) ? s.split(/<[^>]*>/) : [s]) {
    part = squash(decode(part));
    if (!part || part === '{…}' || !/[A-Za-z]{2,}/.test(part)) continue;
    if (/="|^"|\bdata-[a-z-]+=?|\b(class|style|role|aria-[a-z]+)=/.test(part) || codeish(part)) continue;
    if (prose(part) || /^[A-Z][A-Za-z'’&+\- ,!?.()…{}0-9]{1,48}$/.test(part)) out.push(part);
  }
  return out;
}

/** Every player-visible piece written in a source: [{ text, line }]. */
export function playerTexts(src) {
  const out = [];
  for (const { text, at } of stringLiterals(src)) {
    if (devOnly(src, at)) continue;
    const before = src.slice(Math.max(0, at - 60), at);
    if (/\b(import|from|require|querySelector(All)?|getElementById|classList\.\w+|addEventListener|setAttribute\(\s*$|dataset)\s*\(?\s*$/.test(before)) continue;
    if (/\b(case|key|kind|type|id|code|intent|verb|reason|event|action)\s*[:=]=?=?\s*$/.test(before) && !/\s/.test(text)) continue;
    const parts = playerParts(text);
    if (parts.length) { const line = src.slice(0, at).split('\n').length; for (const p of parts) out.push({ text: p, line }); }
  }
  return out;
}

// ── The table ────────────────────────────────────────────────────────────────────────────────────────

const FORMS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);
const KEY_RE = /^[a-z][a-z0-9_]*$/;
const PH_RE = /\{([a-z][A-Za-z0-9_]*)\}/g;
const formsOf = (row) => (typeof row === 'string' ? [row] : row && typeof row === 'object' ? Object.values(row) : []);
export const placeholdersOf = (row) => new Set(formsOf(row).flatMap((s) => (typeof s === 'string' ? [...s.matchAll(PH_RE)].map((m) => m[1]) : [])));

/** The real table (src/data/text/text-table.js under `root`). */
export async function loadTable(root = ROOT) {
  return (await import(pathToFileURL(join(root, REGISTRY)).href)).TEXT;
}

/** Every row of the table: [{ id, row, file, line }] — the line read from the surface file's source. */
export function tableRows(table, sources) {
  const reg = sources.get(REGISTRY) || '';
  const out = [];
  for (const [surface, rows] of Object.entries(table)) {
    /* `farm: FARM_TEXT` in the registry, then `import { FARM_TEXT } from './farm.js'` */
    const exportName = (new RegExp('\\b' + surface.replace(/-/g, '\\-') + '\\s*:\\s*(\\w+)').exec(reg) || [])[1];
    const fileName = exportName ? (new RegExp('import\\s*\\{\\s*' + exportName + '\\s*\\}\\s*from\\s*\'\\./([\\w-]+\\.js)').exec(reg) || [])[1] : null;
    const file = fileName ? TEXT_DIR + fileName : REGISTRY;
    const src = sources.get(file) || '';
    for (const [key, row] of Object.entries(rows)) {
      const at = src.search(new RegExp('^\\s*' + key + '\\s*:', 'm'));
      out.push({ id: surface + '.' + key, row, file, line: at < 0 ? 0 : src.slice(0, at).split('\n').length + 1 });
    }
  }
  return out;
}

/** Every .js source under src (the vendored bundle and the in-page suite skipped), rel path → text. */
export function readSources(root = ROOT) {
  const out = new Map();
  for (const f of walk(join(root, 'src'))) out.set(relative(root, f).split(sep).join('/'), readFileSync(f, 'utf8'));
  return out;
}

// ── The call sites ──────────────────────────────────────────────────────────────────────────────────

/** Index just past the literal opening at `at` (a quote or a backtick, holes skipped). */
function literalEnd(src, at) {
  const q = src[at];
  let i = at + 1, depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (q === '`' && depth === 0 && c === '$' && src[i + 1] === '{') { depth = 1; i += 2; continue; }
    if (depth > 0) { if (c === '{') depth++; else if (c === '}') depth--; i++; continue; }
    if (c === q) return i + 1;
    i++;
  }
  return i;
}

/** The top-level keys of the object literal whose `{` is at `open`: { keys, spread }. */
function objectKeys(src, open) {
  const keys = new Set();
  let spread = false, depth = 0, expect = true;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '\'' || c === '"' || c === '`') {
      if (depth === 1 && expect) { const end = literalEnd(src, i); if (/^\s*:/.test(src.slice(end))) keys.add(src.slice(i + 1, end - 1)); expect = false; i = end - 1; continue; }
      i = literalEnd(src, i) - 1; continue;
    }
    if ('([{'.includes(c)) { depth++; if (depth === 1) expect = true; continue; }
    if (')]}'.includes(c)) { depth--; if (depth === 0) break; continue; }
    if (depth !== 1) continue;
    if (c === ',') { expect = true; continue; }
    if (expect && !/\s/.test(c)) {
      expect = false;
      if (src.startsWith('...', i)) { spread = true; continue; }
      const m = /^([A-Za-z_$][\w$]*)\s*(?=[:,}(])/.exec(src.slice(i, i + 80));
      if (m) { keys.add(m[1]); i += m[1].length - 1; }
    }
  }
  return { keys, spread };
}

const ID_RE = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/;

/** Every t()/hasText() call and every quoted id under src (the table's own files skipped). */
export function callSites(sources) {
  const calls = [], quoted = [];
  for (const [rel, src] of sources) {
    if (rel.startsWith(TEXT_DIR)) continue;
    for (const { text, at } of stringLiterals(src)) {
      const m = /(?:^|[^\w$.])(t|hasText)\(\s*$/.exec(src.slice(Math.max(0, at - 24), at));
      const line = () => src.slice(0, at).split('\n').length;
      if (!m) { if (ID_RE.test(text)) quoted.push({ file: rel, line: line(), id: text }); continue; }
      const end = literalEnd(src, at);
      const rest = src.slice(end, end + 200);
      if (text.includes('§') || /^\s*\+/.test(rest)) { calls.push({ file: rel, line: line(), fn: m[1], prefix: text.split('§')[0] }); continue; }
      let keys = null, spread = false;
      if (/^\s*\)/.test(rest)) keys = new Set();
      else { const o = /^\s*,\s*\{/.exec(rest); if (o) ({ keys, spread } = objectKeys(src, end + o[0].length - 1)); }
      calls.push({ file: rel, line: line(), fn: m[1], id: text, keys, spread });
    }
  }
  return { calls, quoted };
}

// ── The rules ───────────────────────────────────────────────────────────────────────────────────────

export function countTexts(sources, allow = ALLOW) {
  const counts = {}, texts = {};
  const used = new Set();
  for (const [rel, src] of sources) {
    if (!DIRS.some((d) => rel.startsWith(d))) continue;
    const all = playerTexts(src).filter((p) => {
      const a = allow.find((x) => x.file === rel && x.text === p.text);
      if (a) used.add(a);
      return !a;
    });
    if (all.length) { counts[rel] = all.length; texts[rel] = all; }
  }
  return { counts, texts, stale: allow.filter((a) => !used.has(a)) };
}

export function ratchetFindings(found, baseline) {
  const out = [];
  for (const [file, n] of Object.entries(found.counts)) {
    const cap = Object.prototype.hasOwnProperty.call(baseline, file) ? baseline[file] : 0;
    if (n > cap) out.push(`TH-1 ${file} writes ${n} player text(s) in code, ceiling ${cap}: put the new words in ${TEXT_DIR} and read them with t(); `
      + found.texts[file].slice(0, 6).map((p) => `${p.line}: "${p.text.slice(0, 60)}"`).join(' · '));
  }
  for (const a of found.stale) out.push(`TH-1 stale ALLOW row: ${a.file} no longer holds "${a.text}"; delete the row`);
  return out;
}

export function rowFindings(table, sources) {
  const out = [];
  const reg = sources.get(REGISTRY) || '';
  for (const rel of sources.keys()) {
    if (!rel.startsWith(TEXT_DIR) || rel === REGISTRY || rel.slice(TEXT_DIR.length).includes('/')) continue;
    if (!reg.includes('\'./' + rel.slice(TEXT_DIR.length) + '?v=') && !reg.includes('\'./' + rel.slice(TEXT_DIR.length) + '\'')) out.push(`TH-2 ${rel} is not named in ${REGISTRY}: its rows can never be read`);
  }
  for (const [surface, rows] of Object.entries(table)) {
    if (!/^[a-z][a-z0-9-]*$/.test(surface)) out.push(`TH-2 surface "${surface}" is not a lower-case name`);
    for (const [key, row] of Object.entries(rows)) {
      const id = surface + '.' + key;
      if (!KEY_RE.test(key)) out.push(`TH-2 ${id}: a key is snake_case`);
      if (typeof row === 'object' && row !== null) {
        const bad = Object.keys(row).filter((f) => !FORMS.has(f));
        if (bad.length) out.push(`TH-2 ${id}: ${bad.join(', ')} is not a plural form (zero, one, two, few, many, other)`);
        if (typeof row.other !== 'string') out.push(`TH-2 ${id}: a plural row needs its "other" form`);
      } else if (typeof row !== 'string') out.push(`TH-2 ${id}: a row is a string or plural forms`);
      for (const s of formsOf(row)) {
        if (typeof s !== 'string' || !s.trim()) { out.push(`TH-2 ${id}: an empty form`); continue; }
        if (/<\/?[a-z][^>]*>|&#?[A-Za-z0-9]+;/i.test(s)) out.push(`TH-2 ${id}: a row is plain text, no tags or entities ("${s.slice(0, 50)}")`);
        if (/[{}]/.test(s.replace(PH_RE, ''))) out.push(`TH-2 ${id}: a brace that is not a {lowerCamel} placeholder ("${s.slice(0, 50)}")`);
      }
    }
  }
  return out;
}

const rowOf = (table, id) => {
  const dot = id.indexOf('.');
  const s = dot > 0 ? table[id.slice(0, dot)] : undefined;
  return s && Object.prototype.hasOwnProperty.call(s, id.slice(dot + 1)) ? s[id.slice(dot + 1)] : undefined;
};

export function callFindings(table, sites, rows) {
  const out = [];
  for (const c of sites.calls) {
    const at = `${c.file}:${c.line}`;
    if (c.prefix !== undefined) {
      /* a prefix is a family of rows ('farm.refused_'): a bare surface ('farm.') would mark every row of it read (TH-4) */
      if (!/^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]{2,}/.test(c.prefix)) out.push(`TH-3 ${at} ${c.fn}('${c.prefix}' + …) builds an id from a bare surface: name the ids, or a family of 3+ letters`);
      else if (!rows.some((r) => r.id.startsWith(c.prefix))) out.push(`TH-3 ${at} ${c.fn}('${c.prefix}' + …) matches no row`);
      continue;
    }
    const row = rowOf(table, c.id);
    if (row === undefined) { out.push(`TH-3 ${at} ${c.fn}('${c.id}') names no row`); continue; }
    if (c.fn !== 't' || c.keys === null || c.spread) continue;
    const need = placeholdersOf(row);
    const plural = typeof row === 'object';
    if (plural) need.add('count');
    const missing = [...need].filter((k) => !c.keys.has(k));
    const extra = [...c.keys].filter((k) => !need.has(k));
    if (missing.length) out.push(`TH-3 ${at} t('${c.id}') gives no value for ${missing.map((k) => '{' + k + '}').join(', ')}`);
    if (extra.length) out.push(`TH-3 ${at} t('${c.id}') names ${extra.join(', ')}, which the row never reads`);
  }
  return out;
}

export function deadRows(rows, sites) {
  const named = new Set([...sites.calls.filter((c) => c.id).map((c) => c.id), ...sites.quoted.map((q) => q.id)]);
  const prefixes = sites.calls.filter((c) => c.prefix).map((c) => c.prefix);
  return rows.filter((r) => !named.has(r.id) && !prefixes.some((p) => r.id.startsWith(p)))
    .map((r) => `TH-4 ${r.file}:${r.line} ${r.id} is read by nothing: delete the row, or read it`);
}

export function shadowFindings(sources) {
  const out = [];
  for (const [rel, src] of sources) {
    if (!/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'[^']*player-text\.js/.test(src)) continue;
    const code = strip(src).noCS;
    const hits = [
      ...[...code.matchAll(/\bfunction\b[^(]*\(([^)]*)\)/g)].filter((m) => /(?:^|[^\w$.])t\b(?!\s*:)/.test(m[1])),
      ...[...code.matchAll(/\(([^()]*)\)\s*=>/g)].filter((m) => /(?:^|[^\w$.])t\b(?!\s*:)/.test(m[1])),
      ...code.matchAll(/(?:^|[^\w$.])t\s*=>/g),
      ...code.matchAll(/\b(?:const|let|var)\s+t\b/g),
      ...code.matchAll(/\bcatch\s*\(\s*t\s*\)/g),
    ];
    for (const m of hits) out.push(`TH-5 ${rel}:${code.slice(0, m.index).split('\n').length} binds another \`t\` beside the text reader: rename it (el, row…)`);
  }
  return out;
}

/** TH-6: the reader `t`/`has` over `table`, on rows picked from the table itself. */
export function readerFindings(t, has, table) {
  const out = [];
  const all = Object.entries(table).flatMap(([s, rows]) => Object.entries(rows).map(([k, row]) => ({ id: s + '.' + k, row })));
  const plural = all.find((r) => typeof r.row === 'object' && typeof r.row.one === 'string');
  const filled = all.find((r) => typeof r.row === 'string' && placeholdersOf(r.row).size > 0);
  const throws = (f) => { try { f(); return false; } catch { return true; } };
  if (!plural || !filled) return ['TH-6 the table has no plural row with a "one" form and no row with a placeholder: nothing to prove the reader on'];
  const vars = (row, extra) => Object.fromEntries([...placeholdersOf(row)].map((k) => [k, 'V' + k]).concat(Object.entries(extra || {})));
  const fill = (s, v) => s.replace(PH_RE, (_, k) => String(v[k]));
  const one = vars(plural.row, { count: 1 }), two = vars(plural.row, { count: 2 }), zero = vars(plural.row, { count: 0 });
  if (t(plural.id, one) !== fill(plural.row.one, one)) out.push(`TH-6 ${plural.id} at {count} 1 does not read its "one" form`);
  if (t(plural.id, two) !== fill(plural.row.other, two)) out.push(`TH-6 ${plural.id} at {count} 2 does not read its "other" form`);
  if (t(plural.id, zero) !== fill(plural.row.other, zero)) out.push(`TH-6 ${plural.id} at {count} 0 does not read its "other" form`);
  if (t(filled.id, vars(filled.row)) !== fill(filled.row, vars(filled.row))) out.push(`TH-6 ${filled.id} does not fill its placeholders`);
  if (!throws(() => t(filled.id.split('.')[0] + '.no_such_row_th6'))) out.push('TH-6 a missing row does not throw in node');
  if (!throws(() => t(filled.id, {}))) out.push(`TH-6 ${filled.id} with no values does not throw in node`);
  if (!throws(() => t(plural.id, vars(plural.row)))) out.push(`TH-6 ${plural.id} with no {count} does not throw in node`);
  if (has(filled.id.split('.')[0] + '.constructor') || has('constructor.name') || !has(filled.id)) out.push('TH-6 hasText reads an inherited name, or misses a real row');
  return out;
}

// ── The gate ────────────────────────────────────────────────────────────────────────────────────────

function readBaseline() { return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).counts : null; }

/** Every finding over `sources` and `table` (the mutants pass edited copies). TH-6 proves the reader on rows of `readerTable`, the table the
    reader really reads: a row planted only in an edited copy is no row of the reader's, and was picked as the plural sample when the
    first surface held none (release v0.2.119: "no row away.th_mutant_row"). */
export async function findings({ sources, table, baseline, allow = ALLOW, reader, readerTable = table }) {
  const rows = tableRows(table, sources);
  const sites = callSites(sources);
  const found = countTexts(sources, allow);
  const out = [...ratchetFindings(found, baseline), ...rowFindings(table, sources), ...callFindings(table, sites, rows),
    ...deadRows(rows, sites), ...shadowFindings(sources), ...readerFindings(reader.t, reader.hasText, readerTable)];
  return { out, found, rows };
}

async function realReader(root = ROOT) { return import(pathToFileURL(join(root, 'src/render/player-text.js')).href); }

async function gate(report) {
  const baseline = readBaseline();
  if (!baseline) { console.log('text-home: no baseline (tests/text-home.baseline.json); run --write once'); return 1; }
  const { out, found, rows } = await findings({ sources: readSources(), table: await loadTable(), baseline, reader: await realReader() });
  const total = Object.values(found.counts).reduce((a, b) => a + b, 0);
  const ceiling = Object.values(baseline).reduce((a, b) => a + b, 0);
  if (report) for (const [f, n] of Object.entries(found.counts).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
  for (const f of out) console.log('  ✗ ' + f);
  const lower = Object.entries(baseline).filter(([f, n]) => (found.counts[f] || 0) < n).length;
  console.log(`text-home: ${rows.length} rows in the table · ${total} player texts still in code (ceiling ${ceiling}`
    + (lower ? `, ${lower} file(s) under their ceiling: --write lowers it` : '') + `) · ${out.length} finding(s)`);
  return out.length ? 1 : 0;
}

async function write() {
  const old = readBaseline();
  const { counts } = countTexts(readSources());
  if (old) {
    const up = Object.entries(counts).filter(([f, n]) => n > (old[f] || 0));
    if (up.length) { for (const [f, n] of up) console.log(`  ✗ ${f}: ${n} > ${old[f] || 0}`); console.log('text-home --write: a ceiling only goes down; move the new text into the table first'); return 1; }
  }
  const next = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify({ about: 'tests/text-home.mjs TH-1: player-visible string literals still written in code, per file. Only goes down (--write).', counts: next }, null, 2) + '\n');
  console.log(`text-home --write: ${Object.keys(next).length} file(s), ${Object.values(next).reduce((a, b) => a + b, 0)} texts`);
  return 0;
}

/* The mutation proof: the clean tree is green, then each planted defect turns its own rule red. */
async function mutate() {
  const sources = readSources(), table = await loadTable(), baseline = readBaseline(), reader = await realReader();
  const run = async (o) => (await findings({ sources, table, baseline, reader, readerTable: table, ...o })).out;
  const clean = await run({});
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.slice(0, 3).join(' | ')); return 1; }
  const all = Object.entries(table).flatMap(([s, rows]) => Object.entries(rows).map(([k, row]) => ({ id: s + '.' + k, row })));
  const filled = all.find((r) => typeof r.row === 'string' && placeholdersOf(r.row).size > 0);
  const surface = Object.keys(table)[0];
  const ratcheted = Object.keys(baseline)[0];
  const plant = (rel, src) => new Map([...sources, [rel, src]]);
  const imp = 'import { t } from \'../render/player-text.js\';\n';
  const withRow = (row) => ({ ...table, [surface]: { ...table[surface], th_mutant_row: row } });
  const named = (row) => ({ table: withRow(row), sources: plant('src/shell/__th_reader.js', imp + 'export const x = () => t(\'' + surface + '.th_mutant_row\');\n') });
  const MUTANTS = [
    ['TH-1', 'a new sentence in a ratcheted file', { sources: plant(ratcheted, sources.get(ratcheted) + '\nexport const TH_PLANT = \'You found a brand new sentence here.\';\n') }],
    ['TH-1', 'a new file under src/shell that writes a sentence', { sources: plant('src/shell/__th_plant.js', 'export const x = \'Your hero waits at the gate.\';\n') }],
    ['TH-1', 'a stale ALLOW row', { allow: [...ALLOW, { file: ratcheted, text: 'No such words anywhere', why: 'mutant' }] }],
    ['TH-2', 'a surface file the table never names', { sources: plant(TEXT_DIR + '__orphan.js', 'export const ORPHAN_TEXT = Object.freeze({ a: \'Hello there.\' });\n') }],
    ['TH-2', 'a row with markup', named('<b>Bold</b> words')],
    ['TH-2', 'a plural row with no other form', named({ one: '{count} plot' })],
    ['TH-2', 'a stray brace in a row', named('Your {Gold} here')],
    ['TH-2', 'a key that is not snake_case', { table: { ...table, [surface]: { ...table[surface], BadKey: 'Hello.' } } }],
    ['TH-3', 'a call to a row that does not exist', { sources: plant('src/shell/__th_call.js', imp + 'export const x = () => t(\'' + surface + '.no_such_row_th\');\n') }],
    ['TH-3', 'a call that leaves a placeholder empty', { sources: plant('src/shell/__th_call.js', imp + 'export const x = () => t(\'' + filled.id + '\', {});\n') }],
    ['TH-3', 'a call that names a value the row never reads', { sources: plant('src/shell/__th_call.js', imp + 'export const x = () => t(\'' + filled.id + '\', { '
      + [...placeholdersOf(filled.row)].map((k) => k + ': 1').join(', ') + ', thTypo: 2 });\n') }],
    ['TH-3', 'a prefix no row starts with', { sources: plant('src/shell/__th_call.js', imp + 'export const x = (c) => t(\'' + surface + '.zz_none_\' + c);\n') }],
    ['TH-3', 'an id built from a bare surface (it would read every row as used)', { sources: plant('src/shell/__th_call.js', imp + 'export const x = (c) => t(\'' + surface + '.\' + c);\n') }],
    ['TH-4', 'a row nothing reads', { table: withRow('A row nobody reads.') }],
    ['TH-5', 'a handler whose target is named t', { sources: plant('src/shell/__th_shadow.js', imp + 'export function act(ctx, ev, t) { return t.getAttribute(\'data-x\'); }\n') }],
    ['TH-6', 'a reader that never throws', { reader: { t: (id, v) => { try { return reader.t(id, v); } catch { return ''; } }, hasText: reader.hasText } }],
    ['TH-6', 'a reader that ignores plurals', { reader: { t: (id, v) => reader.t(id, v && typeof v.count === 'number' ? { ...v, count: 5 } : v), hasText: reader.hasText } }],
    ['TH-6', 'a hasText that reads inherited names', { reader: { t: reader.t, hasText: (id) => { const [s, k] = String(id).split('.'); return table[s] !== undefined && k in table[s]; } } }],
  ];
  let missed = 0;
  for (const [rule, name, o] of MUTANTS) {
    const red = (await run(o)).filter((f) => f.startsWith(rule));
    console.log(`  ${red.length ? 'caught' : 'MISSED'}  ${rule} ${name}${red.length ? '' : ''}`);
    if (!red.length) missed++;
  }
  console.log(missed ? `text-home --mutate: ${missed} mutant(s) MISSED` : `text-home --mutate: all ${MUTANTS.length} mutants caught, clean control green`);
  return missed ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const argv = process.argv.slice(2);
  try {
    process.exit(argv.includes('--mutate') || argv.includes('--selftest') ? await mutate() : argv.includes('--write') ? await write() : await gate(argv.includes('--report')));
  } catch (e) { console.error('text-home harness error:', e); process.exit(2); }
}
