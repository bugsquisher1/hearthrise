// tools/deploy-edge.local.mjs — the CLAUDE.md §3.3 edge deploy as one command (Coordinator only).
//
//   node tools/deploy-edge.local.mjs            pack + hash only, compare with live (no deploy)
//   node tools/deploy-edge.local.mjs --deploy   pack, deploy hr-accrue, then poll until live payload_sha256 = the pack's
//
// Packs with tools/pack-edge.mjs into a temp workdir (+ supabase/config.toml), deploys with
// `npx supabase functions deploy` and SUPABASE_ACCESS_TOKEN read from ~/.supabase-token (in the
// child's env, never argv, never printed). Run from the checkout whose code should go live.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const REF = 'nezapsylztqbbwuwembx';
const EDGE = `https://${REF}.supabase.co/functions/v1/hr-accrue`;
const deploy = process.argv.includes('--deploy');
const run = (cmd, args, env) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: env || process.env, shell: process.platform === 'win32' && cmd === 'npx' });

/* Ends by setting exitCode and returning: process.exit() with a fetch socket open trips a libuv assert on Windows. */
async function main() {
const want = (run('node', ['tools/pack-edge.mjs', 'hr-accrue', '--hash']).match(/[0-9a-f]{64}/) || [])[0];
if (!want) { console.error('pack-edge gave no hash'); return 1; }
const key = (readFileSync('src/net/supabase-bootstrap.js', 'utf8').match(/eyJ[A-Za-z0-9_\-.]{40,}/) || [])[0] || '';
const live = async () => { try { return (await (await fetch(EDGE, { headers: { Authorization: 'Bearer ' + key, apikey: key } })).json()).payload_sha256 || ''; } catch (e) { return ''; } };
const before = await live();
console.log(`this checkout ${want.slice(0, 12)} · live ${before.slice(0, 12) || '?'}${want === before ? ' · already live' : ''}`);
if (!deploy) { console.log(want === before ? 'Nothing to deploy.' : 'Dry run. Add --deploy to ship it.'); return 0; }
if (want === before) { console.log('Already live; not deploying.'); return 0; }

const dir = mkdtempSync(join(tmpdir(), 'hr-edge-'));
mkdirSync(join(dir, 'supabase'), { recursive: true });
run('node', ['tools/pack-edge.mjs', 'hr-accrue', '--out', join(dir, 'supabase', 'functions', 'hr-accrue')]);
copyFileSync('supabase/config.toml', join(dir, 'supabase', 'config.toml'));
const env = { ...process.env, SUPABASE_ACCESS_TOKEN: readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim() };
try { run('npx', ['--yes', 'supabase@latest', 'functions', 'deploy', 'hr-accrue', '--workdir', dir, '--project-ref', REF], env); }
catch (e) { console.error('deploy failed:', String(e.stderr || e.message).replace(env.SUPABASE_ACCESS_TOKEN, '***').slice(-800)); return 1; }
for (let i = 0; i < 12; i++) {
  const now = await live();
  if (now === want) { console.log(`DEPLOYED and verified: live payload_sha256 ${want}`); return 0; }
  await new Promise((r) => setTimeout(r, 5000));
}
console.error(`deployed, but live still reports ${(await live()).slice(0, 12)}; check the function`); return 1;
}
process.exitCode = await main();
