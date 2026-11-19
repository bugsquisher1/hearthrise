// ════════════════════════════════════════════════════════════════════════
// tools/lib/version-stamp.mjs — THE RELEASE STAMP, IN ONE PLACE.
//
// A browser keys a module by its whole URL, so `x.js?v=0.2.142` is fetched fresh the day it ships while `x.js` may come
// from a ten-minute cache. Every module a page loads therefore carries the release's `?v=` — and carries the SAME one,
// because `x.js?v=A` and `x.js?v=B` are two modules, evaluated twice with two copies of their state (b493).
//
// THE STAMP IS WRITTEN AT PUBLISH TIME (architecture audit 2026-11-18, item 1). The source carries no `?v=`;
// tools/build-site.mjs writes `?v=<BUILD.version>` onto every module specifier and page tag as it copies the site, and
// .github/workflows/pages.yml deploys that copy. The test servers (tests/_client-harness.mjs, tools/qa/local-world.mjs)
// serve through the same transform, so every page a test loads is the page a player loads.
//
// UNTIL THE FLAG DAY the source still carries its stamps: tools/strip-version-stamps.mjs takes them out in one commit,
// at a release boundary, once Pages serves the built site. Every reader here takes both states, and nothing else:
//   bare      no stamp anywhere (the end state)
//   stamped   every specifier and tag at the current version (today's source, served as-is by a branch deploy)
// A tree with both is the b493 double load in Node (tests import the engine's own instances) and is red in
// tests/cache-buster-guard.mjs, which names the fix.
//
// WHAT IS STAMPED (measured on the stamped tree 2026-11-19: build(strip(tree)) is byte-identical to it):
//   modules   every single- or double-quoted relative specifier ending in .js (`'./x.js'`, `"../y.js"`): static and
//             bare imports, export-from, literal import(), JSDoc `import('…')` types. NOT the first argument of
//             `new URL('…', import.meta.url)` (a runtime URL that appends its own version where it needs one), and
//             nothing under src/vendor/ (third-party bytes, pinned by name and sha384).
//   pages     every root *.html `src="…"` / `href="…"` naming a local file other than a page (`href="play.html"`
//             is a link, not a load).
// mutant-anchors: none — a library; its proofs are tools/build-site.mjs SITE-9 and tools/strip-version-stamps.mjs --selftest
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VENDOR = 'src/vendor/';
const VERSION = /^\d+\.\d+\.\d+$/;

/** A relative module specifier in quotes, with the stamp it carries (if any). Quotes and line breaks end a match. */
const SPEC_RE = /(['"])(\.{1,2}\/[^'"\n]*?\.js)(\?v=[^'"\n]*)?\1/g;
/** Any quoted string ending in a `?v=<digits>` stamp: what the strip removes (every stamp, not only specifiers). */
const QUOTED_STAMP_RE = /(['"`])([^'"`\n]*?)\?v=\d[\d.]*\1/g;
/** A page attribute that can load a file. */
const TAG_RE = /\b(src|href)="([^"]*)"/g;

const inNewUrl = (src, at) => /\bnew\s+URL\(\s*$/.test(src.slice(Math.max(0, at - 32), at));
const localLoad = (ref) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref) && /\.(?!html?$)[a-z0-9]+$/i.test(ref.split(/[?#]/)[0]);

/** src/build-info.js's version, cache and date. Throws when it cannot be read: a stamp nobody can name is no stamp. */
export function readBuild(root = ROOT, text) {
  const src = text ?? readFileSync(join(root, 'src', 'build-info.js'), 'utf8');
  const field = (k) => (new RegExp('\\b' + k + ":\\s*'([^']*)'").exec(src) || [])[1];
  const out = { version: field('version'), cache: field('cache'), date: field('date') };
  if (!VERSION.test(out.version || '') || !VERSION.test(out.cache || '')) throw new Error('src/build-info.js: no semver version/cache to stamp with (read ' + JSON.stringify(out) + ')');
  return out;
}

// ── MODULES ──────────────────────────────────────────────────────────────
/** Every stampable specifier in a module: { spec, query ('' when bare), at }. */
export function moduleSpecifiers(src) {
  const out = [];
  for (const m of src.matchAll(SPEC_RE)) if (!inNewUrl(src, m.index)) out.push({ spec: m[2], query: m[3] || '', at: m.index });
  return out;
}

/** Every quoted `?v=<digits>` stamp in a module, specifier or not: { text, version, at }. */
export function moduleStamps(src) {
  return Array.from(src.matchAll(QUOTED_STAMP_RE), (m) => ({ text: m[0], version: /\?v=(\d[\d.]*)/.exec(m[0])[1], at: m.index }));
}

/** The module with every quoted stamp removed. Idempotent. */
export const stripModule = (src) => src.replace(QUOTED_STAMP_RE, '$1$2$1');

/** The module with every stampable specifier at `version` (whatever it carried before). Idempotent. */
export function stampModule(src, version) {
  return src.replace(SPEC_RE, (all, q, spec, _query, at) => (inNewUrl(src, at) ? all : q + spec + '?v=' + version + q));
}

// ── PAGES ────────────────────────────────────────────────────────────────
/** Every tag attribute in a page that loads a local file: { ref (no query), query, at }. */
export function pageTags(html) {
  const out = [];
  for (const m of html.matchAll(TAG_RE)) {
    if (!localLoad(m[2])) continue;
    const q = /\?v=[^"#]*/.exec(m[2]);
    out.push({ ref: m[2].replace(/\?v=[^"#]*/, ''), query: q ? q[0] : '', at: m.index });
  }
  return out;
}

export const stripPage = (html) => html.replace(TAG_RE, (all, attr, ref) => (localLoad(ref) ? attr + '="' + ref.replace(/\?v=\d[\d.]*/, '') + '"' : all));

export function stampPage(html, version) {
  return html.replace(TAG_RE, (all, attr, ref) => {
    if (!localLoad(ref)) return all;
    const bare = ref.replace(/\?v=[^"#&]*/, '');
    if (bare.includes('?')) return all;   // a local file with a query of its own: not ours to rewrite (SITE-9 names it)
    const hash = bare.indexOf('#');
    return attr + '="' + (hash < 0 ? bare + '?v=' + version : bare.slice(0, hash) + '?v=' + version + bare.slice(hash)) + '"';
  });
}

// ── FILES ────────────────────────────────────────────────────────────────
/** 'module' for a stamped module (src/**.js outside the vendor folder), 'page' for a root page, null for the rest. */
export function stampKind(rel) {
  if (/^[^/]+\.html$/.test(rel)) return 'page';
  if (rel.startsWith('src/') && rel.endsWith('.js') && !rel.startsWith(VENDOR)) return 'module';
  return null;
}

/** A file's text as the site serves it at `version`; anything that carries no stamp comes back unchanged. */
export function stampFile(rel, text, version) {
  const kind = stampKind(rel);
  return kind === 'module' ? stampModule(text, version) : kind === 'page' ? stampPage(text, version) : text;
}

/** A file's text with its stamps taken out (the flag-day codemod); anything else unchanged. */
export function stripFile(rel, text) {
  const kind = stampKind(rel);
  return kind === 'module' ? stripModule(text) : kind === 'page' ? stripPage(text) : text;
}

// ── THE SOURCE'S STATE (until the flag day) ─────────────────────────────
const SENTINELS = ['src/core/combat-sim.js', 'src/data/monsters.js', 'src/app/boot.js'];
const QUERY_OF = new Map();

/**
 * The query the source's own imports carry: '?v=X.Y.Z' while the source is stamped, '' once it is bare.
 * A Node caller appends it to reach the SAME module instance the source's imports reach (the engine's rows,
 * a what-if hook, a planted fixture): `import(pathToFileURL(join(root, 'src/data/items.js')).href + sourceQuery(root))`.
 * Read from the first sentinel module with a relative import; tests/cache-buster-guard.mjs holds every other
 * module to the same state.
 */
export function sourceQuery(root = ROOT) {
  const key = resolve(root);
  if (QUERY_OF.has(key)) return QUERY_OF.get(key);
  let q = '';
  for (const rel of SENTINELS) {
    const p = join(key, rel);
    if (!existsSync(p)) continue;
    const first = moduleSpecifiers(readFileSync(p, 'utf8'))[0];
    if (first) { q = first.query; break; }
  }
  QUERY_OF.set(key, q);
  return q;
}
