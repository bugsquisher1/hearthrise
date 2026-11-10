// ════════════════════════════════════════════════════════════════════════
// tools/deploy-staging-site.local.mjs — PUT A RELEASE BRANCH'S CLIENT ON THE STAGING SITE (Coordinator only).
//
//   node tools/deploy-staging-site.local.mjs 0.2.115            build the site commit from release/v0.2.115 and print it (no network)
//   node tools/deploy-staging-site.local.mjs 0.2.115 --push     ...and push it to the staging repo's `site` branch
//   options: --ref <git ref>   another source than release/vX.Y.Z      --remote <name>   another remote than `staging`
//
// The staging site is a second GitHub Pages site (a second repo, served from its `site` branch on
// https://staging.hearthrise.net; .claude/coordination/staging-2026-11-10.md §3). What it serves is the release's
// own tree with TWO differences, both outside the client:
//   CNAME      names the staging host. The tree's own CNAME says hearthrise.net, and a Pages branch that carries
//              production's CNAME asks GitHub to move production's domain onto the staging repo.
//   .github/   is left out, so the staging repo holds no workflow: no second CI, nothing scheduled there.
// Every other byte is the release's (the commit's tree is checked against the source tree before anything is said).
// One commit with no parent each time: the staging repo is a shop window, not a history.
//
// It never pushes anywhere but a remote whose repository name says staging, and never to a branch named main.
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { resolveEnv, runTool, EnvRefusal, STAGING_SITE, isStagingHost } from './lib/env.mjs';

const BRANCH = 'site';
const gitReal = (args, o = {}) => execFileSync('git', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...o }).trim();

/**
 * @param {string[]} argv
 * @param {object} [deps]  { git(args, opts) -> stdout, read, home, log, err }: injectable (tests/tool-env.mjs)
 */
export async function main(argv, deps = {}) {
  const log = deps.log || console.log;
  const git = deps.git || gitReal;
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const ver = String(argv.find((a) => /^v?\d+\.\d+\.\d+$/.test(String(a))) || '').replace(/^v/, '');
  if (!ver) { (deps.err || console.error)('usage: node tools/deploy-staging-site.local.mjs X.Y.Z [--push] [--ref <ref>] [--remote <name>]'); return 2; }
  const ref = opt('--ref', `release/v${ver}`);
  const remote = opt('--remote', 'staging');
  let site = STAGING_SITE;
  try { site = resolveEnv({ argv: ['--env', 'staging'], write: false, home: deps.home, read: deps.read }).site; }
  catch (e) { if (!e.refusal || !/not set up/.test(e.message)) throw e; }
  const host = new URL(site).hostname;
  if (!isStagingHost(host)) throw new EnvRefusal(`The staging site ${host} has no "staging" in its name.`);
  log(`[env: staging · site ${host}] ${argv.includes('--push') ? 'PUSH' : 'dry run'}`);

  const src = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  const built = (git(['show', `${src}:src/build-info.js`]).match(/version:\s*'([^']+)'/) || [])[1];
  if (built !== ver) throw new EnvRefusal(`${ref} is v${built}, not v${ver}. Nothing was built.`);

  /* A scratch index, never the checkout's: the working tree and its index are not touched. */
  const dir = mkdtempSync(join(tmpdir(), 'hr-staging-site-'));
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') };
  let commit;
  try {
    git(['read-tree', src], { env });
    git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '.github'], { env });
    const blob = git(['hash-object', '-w', '--stdin'], { input: host + '\n' });
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},CNAME`], { env });
    const tree = git(['write-tree'], { env });
    commit = git(['commit-tree', tree, '-m', `staging site: v${ver} (${src.slice(0, 9)})`]);
  } finally { rmSync(dir, { recursive: true, force: true }); }

  /* What differs from the release must be CNAME and .github, and nothing else. */
  const moved = git(['diff-tree', '-r', '--name-only', src, commit]).split('\n').filter(Boolean);
  const stray = moved.filter((p) => p !== 'CNAME' && !p.startsWith('.github/'));
  if (stray.length || git(['show', `${commit}:CNAME`]) !== host) throw new Error(`the site commit is not the release's tree: ${stray.slice(0, 3).join(', ') || 'CNAME is wrong'}`);
  log(`site commit ${commit.slice(0, 12)} = ${ref} (${src.slice(0, 9)}, v${ver}) with CNAME ${host} and no .github (${moved.length} path(s) differ, none in the client)`);

  if (!argv.includes('--push')) { log(`Dry run. Add --push to send it to ${remote}/${BRANCH}.`); return 0; }
  const url = git(['remote', 'get-url', remote]);
  const repo = (/([^/:]+?)(?:\.git)?$/.exec(url) || [])[1] || '';
  if (!repo.toLowerCase().includes('staging')) throw new EnvRefusal(`The remote "${remote}" is the repository "${repo}", which does not say staging. Nothing was pushed.`);
  git(['push', remote, `+${commit}:refs/heads/${BRANCH}`]);
  log(`pushed to ${repo}/${BRANCH}. Then: node tools/release-check.local.mjs ${ver} --env staging`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
