// ════════════════════════════════════════════════════════════════════════
// tools/deploy-staging-site.local.mjs — PUT A RELEASE BRANCH'S CLIENT ON THE STAGING SITE (Coordinator only).
//
//   node tools/deploy-staging-site.local.mjs 0.2.115            build the site commit from release/v0.2.115 and print it (no network)
//   node tools/deploy-staging-site.local.mjs 0.2.115 --push     ...and push it to the staging repo's `site` branch
//   options: --ref <git ref>   another source than release/vX.Y.Z      --remote <name>   another remote than `staging`
//
// The staging site is a second GitHub Pages site (a second repo, served from its `site` branch on
// https://staging.hearthrise.net; .claude/coordination/staging-2026-11-10.md §3). What it serves is THE PUBLISH SET
// of the release (tools/build-site.mjs PUBLISH: the same rows production's Pages artifact is built from, about 10 MB
// of the repository's 253), taken from the release branch's own tree, with two differences outside the client:
//   CNAME      names the staging host. The tree's own CNAME says hearthrise.net, and a Pages branch that carries
//              production's CNAME asks GitHub to move production's domain onto the staging repo.
//   .nojekyll  is kept: the staging repo deploys from a branch, and a branch deploy without it runs Jekyll.
// No workflow, test, tool or migration is in it: the staging repo runs no CI and nothing scheduled.
// Every byte it does hold is the release's (checked against the source tree before anything is said).
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
import { PUBLISH, globRe } from './build-site.mjs';

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
    /* only what the site publishes: production's own rows, read against this branch's file list */
    const rows = PUBLISH.map(globRe);
    const drop = git(['ls-files', '-z'], { env }).split('\0').filter((p) => p && p !== '.nojekyll' && !rows.some((r) => r.test(p)));
    if (drop.length) git(['update-index', '-z', '--force-remove', '--stdin'], { env, input: drop.join('\0') + '\0' });
    const blob = git(['hash-object', '-w', '--stdin'], { input: host + '\n' });
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},CNAME`], { env });
    const tree = git(['write-tree'], { env });
    /* Its own name on the commit: a machine with no git identity (CI) can build it, and nobody's address lands in a public repo. */
    const who = { GIT_AUTHOR_NAME: 'Hearthrise staging site', GIT_AUTHOR_EMAIL: 'staging-site@hearthrise.invalid', GIT_COMMITTER_NAME: 'Hearthrise staging site', GIT_COMMITTER_EMAIL: 'staging-site@hearthrise.invalid' };
    commit = git(['commit-tree', tree, '-m', `staging site: v${ver} (${src.slice(0, 9)})`], { env: { ...process.env, ...who } });
  } finally { rmSync(dir, { recursive: true, force: true }); }

  /* Nothing in the site may be new or changed against the release, CNAME apart; and the game's page must be in it. */
  const changed = git(['diff-tree', '-r', '--name-only', '--diff-filter=AMT', src, commit]).split('\n').filter(Boolean);
  const held = git(['ls-tree', '-r', '--name-only', commit]).split('\n').filter(Boolean);
  if (changed.join() !== 'CNAME' || git(['show', `${commit}:CNAME`]) !== host || !held.includes('play.html') || !held.includes('src/build-info.js')) {
    throw new Error(`the site commit is not the release's publish set: ${changed.filter((p) => p !== 'CNAME').slice(0, 3).join(', ') || 'CNAME or play.html is wrong'}`);
  }
  log(`site commit ${commit.slice(0, 12)} = the publish set of ${ref} (${src.slice(0, 9)}, v${ver}): ${held.length} files, CNAME ${host}, every other byte the release's`);

  if (!argv.includes('--push')) { log(`Dry run. Add --push to send it to ${remote}/${BRANCH}.`); return 0; }
  const url = git(['remote', 'get-url', remote]);
  const repo = (/([^/:]+?)(?:\.git)?$/.exec(url) || [])[1] || '';
  if (!repo.toLowerCase().includes('staging')) throw new EnvRefusal(`The remote "${remote}" is the repository "${repo}", which does not say staging. Nothing was pushed.`);
  git(['push', remote, `+${commit}:refs/heads/${BRANCH}`]);
  log(`pushed to ${repo}/${BRANCH}. Then: node tools/release-check.local.mjs ${ver} --env staging`);
  return 0;
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
