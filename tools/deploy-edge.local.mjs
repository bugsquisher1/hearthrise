// tools/deploy-edge.local.mjs — the CLAUDE.md §3.3 edge deploy as one command (Coordinator only).
//
//   node tools/deploy-edge.local.mjs [--env production|staging]     pack + hash only, compare with that project's function (no deploy)
//   node tools/deploy-edge.local.mjs --deploy --env staging         pack, deploy hr-accrue to STAGING, poll until its payload_sha256 = the pack's
//   node tools/deploy-edge.local.mjs --deploy --env production      the same, to PRODUCTION
//
// A deploy names its project (tools/lib/env.mjs): --deploy with no --env refuses and sends nothing. The first line
// printed is the project. The bundle is the SAME bytes for both projects (one pack, one hash): what staging ran is
// what production gets.
//
// Packs with tools/pack-edge.mjs into a temp workdir (+ supabase/config.toml), deploys with
// The CLI (3.0.0+) stops a hosted change from an agent run unless --yes says a person OK'd it; Tyler 2026-11-03: yes, every deploy.
// `npx supabase functions deploy` and SUPABASE_ACCESS_TOKEN read from the env's token file (in the
// child's env, never argv, never printed). Run from the checkout whose code should go live.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isMain } from '../tests/_is-main.mjs';
import { resolveEnv, assertIdentity, clientKeyOf, runTool } from './lib/env.mjs';

const runReal = (cmd, args, env) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: env || process.env, shell: process.platform === 'win32' && cmd === 'npx' });

/**
 * Ends by returning the exit code: process.exit() with a fetch socket open trips a libuv assert on Windows.
 * @param {string[]} argv
 * @param {object} [deps]  { fetch, read, home, log, err, run, sleep }: injectable (tests/tool-env.mjs)
 */
export async function main(argv, deps = {}) {
  const log = deps.log || console.log;
  const err = deps.err || console.error;
  const read = deps.read || ((p) => readFileSync(p, 'utf8'));
  const run = deps.run || runReal;
  const fetchImpl = deps.fetch || fetch;
  const sleep = deps.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deploy = argv.includes('--deploy');
  const env = resolveEnv({ argv, write: deploy, home: deps.home, read });
  log(env.banner + (deploy ? ' DEPLOY' : ' dry run'));

  const want = (run('node', ['tools/pack-edge.mjs', 'hr-accrue', '--hash']).match(/[0-9a-f]{64}/) || [])[0];
  if (!want) { err('pack-edge gave no hash'); return 1; }
  /* The key the gateway wants for this project: the one the client ships for it, else the one envs.json names. */
  const key = clientKeyOf(read('src/net/supabase-bootstrap.js'), env.name) || env.publishableKey;
  const EDGE = env.fn('hr-accrue');
  const live = async () => { try { return (await (await fetchImpl(EDGE, { headers: { Authorization: 'Bearer ' + key, apikey: key } })).json()).payload_sha256 || ''; } catch (e) { return ''; } };
  const before = await live();
  log(`this checkout ${want.slice(0, 12)} · ${env.name} ${before.slice(0, 12) || '?'}${want === before ? ' · already there' : ''}`);
  if (!deploy) { log(want === before ? 'Nothing to deploy.' : `Dry run. Add --deploy --env ${env.name} to ship it.`); return 0; }
  if (want === before) { log('Already there; not deploying.'); return 0; }

  const named = await assertIdentity(env, fetchImpl);
  log(`project answers to "${named}"`);
  const dir = mkdtempSync(join(tmpdir(), 'hr-edge-'));
  mkdirSync(join(dir, 'supabase'), { recursive: true });
  run('node', ['tools/pack-edge.mjs', 'hr-accrue', '--out', join(dir, 'supabase', 'functions', 'hr-accrue')]);
  /* The workdir's config names the SAME project as --remote: a staging deploy carries production's ref nowhere. */
  const config = read('supabase/config.toml');
  const aimed = config.replace(/^project_id\s*=\s*"[a-z]+"/m, `project_id = "${env.ref}"`);
  if (!aimed.includes(`project_id = "${env.ref}"`)) { err('supabase/config.toml has no project_id line to aim'); return 1; }
  writeFileSync(join(dir, 'supabase', 'config.toml'), aimed);
  const token = env.token();
  const childEnv = { ...process.env, SUPABASE_ACCESS_TOKEN: token };
  try { run('npx', ['--yes', 'supabase@latest', 'functions', 'deploy', 'hr-accrue', '--workdir', dir, `--remote=${env.ref}`, '--yes'], childEnv); }
  catch (e) { err('deploy failed: ' + String(e.stderr || e.message).split(token).join('***').slice(-800)); return 1; }
  for (let i = 0; i < 12; i++) {
    const now = await live();
    if (now === want) { log(`DEPLOYED and verified on ${env.name}: payload_sha256 ${want}`); return 0; }
    await sleep(5000);
  }
  err(`deployed, but ${env.name} still reports ${(await live()).slice(0, 12)}; check the function`); return 1;
}

if (isMain(import.meta.url)) process.exitCode = await runTool(main, process.argv.slice(2));
