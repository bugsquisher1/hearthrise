#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/_site-scans.mjs — THE SECRET AND SUPPLY-CHAIN SCANS, OVER THE REPO OR OVER A BUILT SITE.
//
// Not a guard of its own: tests/run-smoke.mjs runs them over the repo (the gate's own "Secret guard" and "Supply-chain guard" lines, moved here unchanged
// 2026-11-04 so a built site gets the same words), tests/ship-build.mjs over the built output, where SB-8 proves each still bites.
// mutant-anchors: none — a helper, not a guard
// ════════════════════════════════════════════════════════════════════════
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

// ── The secret guard (b322) ──────────────────────────────────────────────────
// A LIVE Discord webhook URL sat in src/bug-report.js as a plain constant for
// ~200 builds. hearthrise.net is GitHub Pages serving a PUBLIC repo, so that
// token was readable by anyone — in the shipped bundle and in git history
// forever. A webhook token permits POST (fake reports), PATCH (rename) and
// DELETE (destroy it), and the failure mode of a bug reporter is SILENCE: had
// anyone deleted it, reports would simply have stopped arriving.
//
// Deleting the constant does not stop this recurring; a guard does. This is the
// real deliverable of that fix. Two rules, both cheap:
//
//   A. ZERO TOLERANCE in shipped client source (src/**, old-client.html, sw.js and
//      any root-level .js). Not even a commented-out or blank one — a blank
//      placeholder is an invitation to paste a real value back in.
//   B. REPO-WIDE, credential-shaped only: a webhook URL with a real snowflake
//      id and a long token, a GitHub PAT, or a JWT whose payload claims
//      service_role. Shaped so documentation placeholders ("…/1234.../abcd…")
//      do not trip it, because a guard that cries wolf gets deleted.
//
// The needles are assembled from fragments so this file cannot match itself.
/** @param {string} [root] the tree to scan: the repo, or a built site */
export async function secretGuard(root = ROOT) {
  const D = ['discord', 'com'].join('.') + '/api/' + 'webhooks';
  const SHAPED = new RegExp(
    '(?:discord|discordapp)\\.com/api/webhooks/[0-9]{15,}/[A-Za-z0-9_-]{40,}', 'i');
  const PAT = /\b(?:ghp|gho|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b/;
  const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{16,})\.[A-Za-z0-9_-]{8,}\b/g;

  const SKIP_DIRS = new Set(['.git', 'node_modules', 'worktrees', '.venv', 'dist', 'build']);
  const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.html', '.htm',
    '.css', '.md', '.sql', '.toml', '.yml', '.yaml', '.sh', '.txt', '.webmanifest', '.svg']);
  const SELF = normalize(join(ROOT, 'tests', '_site-scans.mjs'));

  const problems = [];
  const files = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(full); continue; }
      if (!TEXT_EXT.has(extname(e.name).toLowerCase())) continue;
      const info = await stat(full).catch(() => null);
      if (!info || info.size > 4_000_000) continue;   // skip generated monsters
      files.push(full);
    }
  }
  await walk(root);
  if (files.length < 50) problems.push(`only ${files.length} files scanned — the guard is checking nothing`);

  // Client source is everything the browser downloads.
  const isClientSource = (f) => {
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    return rel.startsWith('src/') || rel.startsWith('a/') || /^[^/]+\.html$/.test(rel) || rel === 'sw.js'
      || (!rel.includes('/') && rel.endsWith('.js'));
  };

  for (const f of files) {
    if (normalize(f) === SELF) continue;             // the guard states the pattern
    let text;
    try { text = await readFile(f, 'utf8'); } catch { continue; }
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');

    if (isClientSource(f) && text.includes(D)) {
      problems.push(`${rel}: a Discord webhook URL is in SHIPPED CLIENT SOURCE — secrets belong in an Edge Function secret, never in the bundle`);
    }
    const shaped = text.match(SHAPED);
    if (shaped) {
      problems.push(`${rel}: a credential-shaped Discord webhook URL is committed (…${shaped[0].slice(-8)}) — regenerate it in Discord and move it to a server-side secret`);
    }
    const sbSecret = text.match(/\bsb_secret_[A-Za-z0-9_-]{20,}\b/);
    if (sbSecret) problems.push(`${rel}: a Supabase SECRET key is committed — it bypasses RLS entirely; delete it in the dashboard now`);
    const pat = text.match(PAT);
    if (pat) problems.push(`${rel}: a GitHub personal access token is committed (${pat[0].slice(0, 8)}…)`);

    JWT.lastIndex = 0;
    let m;
    while ((m = JWT.exec(text)) !== null) {
      let payload = '';
      try { payload = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
      catch { continue; }
      if (/"role"\s*:\s*"service_role"/.test(payload)) {
        problems.push(`${rel}: a SERVICE ROLE key is committed — that key bypasses RLS entirely; rotate it now`);
        break;
      }
    }
  }
  return problems;
}

// ── The supply-chain guard (2026-08-23, open-beta security audit) ────────────
// A sibling of secretGuard, and it exists for the same reason: a repo-wide,
// filesystem-level check catches the class, where a per-file review catches the
// instance.
//
// THE FINDING. src/net/auth.js did `import('https://cdn.skypack.dev/@supabase/
// supabase-js')` — the module the player's EMAIL AND PASSWORD are handed to and
// which holds the session token, fetched UNPINNED from a third party with no
// integrity check (a dynamic import() cannot carry one), fanning out to five
// more fetches from that origin. Two requests to that URL seconds apart
// resolved to two DIFFERENT library versions. A compromise of that origin was a
// compromise of every Hearthrise account, and the whole suite was green.
//
// THE RULE: shipped client source may not fetch EXECUTABLE code from an origin
// we do not control. Data is a different question and is not covered here.
//
// THE ALLOWLIST is deliberately tiny and each entry states what makes it
// tolerable. An entry that cannot state that does not belong in it.
/** @param {string} [root] the tree to scan: the repo, or a built site  @param {{ also?: string[], skip?: (rel: string) => boolean }} [o] more folders, and files that are pinned elsewhere */
export async function supplyChainGuard(root = ROOT, o = {}) {
  // A <script> TAG can carry Subresource Integrity; a dynamic import() cannot.
  // That is the entire basis on which the one exception below is allowed, so
  // the allowlist is keyed on the mechanism, not on the vendor's reputation.
  const SCRIPT_TAG_ALLOWED = [
    // Sentry crash reporting. Version-pinned URL + a committed sha384 that
    // src/observability.js assigns to script.integrity, with crossOrigin set
    // (which SRI requires). Smoke test SEC-SRI-1 asserts all three.
    'browser.sentry-cdn.com',
  ];
  // Non-executable subresources. A stylesheet cannot execute; the worst a
  // hostile fonts.googleapis.com could do is restyle the page. Listed so the
  // scan below does not have to guess at intent.
  const NON_EXECUTABLE_ALLOWED = ['fonts.googleapis.com', 'fonts.gstatic.com'];

  const SKIP_DIRS = new Set(['.git', 'node_modules', 'worktrees', '.venv', 'dist', 'build',
    '_archive', '.legacy', 'vendor']);   // vendor/ IS the fix; it is pinned + hashed by SEC-CDN-2
  const problems = [];
  const files = [];
  async function walk(dir) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) await walk(full); continue; }
      const ext = extname(e.name).toLowerCase();
      if (ext !== '.js' && ext !== '.html') continue;
      files.push(full);
    }
  }
  await walk(join(root, 'src'));
  for (const d of o.also || []) await walk(join(root, d));
  files.push(join(root, 'index.html'), join(root, 'play.html'));

  // THE CONTROL. This guard has to be able to say it looked at something. A
  // walk that silently found nothing is the always-null probe this repo has
  // shipped six of.
  if (files.length < 30) {
    problems.push(`supply-chain guard walked only ${files.length} files — it is checking nothing`);
    return problems;
  }

  // Tests are excluded from the *executable-import* rule (they legitimately
  // name hostile URLs as fixtures) but NOT from the file walk, so a real call
  // site that migrates into a test file is still visible in the diff.
  const isTest = (rel) => rel.includes('smoke-test.js')
    || rel.startsWith('src/features/smoke/')   // the suite is a directory since 2026-09-14
    || rel.startsWith('tests/');

  for (const f of files) {
    let text;
    try { text = await readFile(f, 'utf8'); } catch { continue; }
    const rel = f.slice(root.length + 1).replace(/\\/g, '/');
    if (isTest(rel) || (o.skip && o.skip(rel))) continue;
    // Strip comments so the codebase can keep EXPLAINING the hole it closed
    // without the guard failing on its own documentation.
    const src = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
                    .replace(/<!--[\s\S]*?-->/g, ' ');

    const hits = [];
    for (const m of src.matchAll(/\bimport\s*\(\s*['"`](https?:\/\/[^'"`]+)/g)) hits.push(['dynamic import()', m[1]]);
    for (const m of src.matchAll(/\bfrom\s*['"`](https?:\/\/[^'"`]+)/g)) hits.push(['static import', m[1]]);
    for (const m of src.matchAll(/\.src\s*=\s*['"`](https?:\/\/[^'"`]+\.js[^'"`]*)/g)) hits.push(['script.src', m[1]]);
    for (const m of src.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)/gi)) hits.push(['<script src>', m[1]]);
    for (const m of src.matchAll(/<link[^>]+href=["'](https?:\/\/[^"']+)/gi)) hits.push(['<link href>', m[1]]);

    for (const [kind, url] of hits) {
      let host = '';
      try { host = new URL(url).host; } catch { continue; }
      if (NON_EXECUTABLE_ALLOWED.includes(host) && (kind === '<link href>')) continue;
      if (SCRIPT_TAG_ALLOWED.includes(host) && (kind === '<script src>' || kind === 'script.src')) continue;
      if (kind === 'dynamic import()' || kind === 'static import') {
        problems.push(`${rel}: ${kind} of executable code from ${host} — an import() CANNOT carry an integrity `
          + `hash, so nothing verifies what arrives. Vendor it under src/vendor/ (pinned filename) and load it `
          + `from our own origin. This is the exact hole the 2026-08-23 audit found in src/net/auth.js.`);
      } else {
        problems.push(`${rel}: ${kind} loads ${url} from ${host}, which is not on the SRI-verified allowlist. `
          + `Either add an integrity hash and allowlist the host here (with the reason), or self-host it.`);
      }
    }
  }
  return problems;
}
