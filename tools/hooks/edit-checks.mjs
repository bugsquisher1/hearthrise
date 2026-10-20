// tools/hooks/edit-checks.mjs — PostToolUse hook (Edit | Write): the sub-second guards for the file
// just edited, so a token, breakpoint or `?v=` mistake is caught on the edit, not on GitHub.
//
//   *.css under src/        → breakpoint-guard, token-single-source, css-literal-ratchet
//   *.js / *.mjs under src/ → window-globals-exist + pack-edge versionQueryGuard (`?v=` rules)
// Runs in the edited file's own checkout (a lane worktree or main). Silent when green; when red,
// exits 2 with the guard's last lines so the session sees what to fix. Not a substitute for the
// lane's own lane-done or the GitHub run.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, relative, join } from 'node:path';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch (e) { process.exit(0); }
const file = (input.tool_input && input.tool_input.file_path) || (input.tool_response && input.tool_response.filePath);
if (!file || !existsSync(file)) process.exit(0);
let root;
try { root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dirname(file), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
catch (e) { process.exit(0); }
if (!existsSync(join(root, 'tests', 'breakpoint-guard.mjs'))) process.exit(0);   // not a Hearthrise checkout
const rel = relative(root, file).replace(/\\/g, '/');

const runs = [];
if (/^src\/.+\.css$/.test(rel)) runs.push(['tests/breakpoint-guard.mjs'], ['tests/token-single-source.mjs'], ['tests/css-literal-ratchet.mjs']);
if (/^src\/.+\.m?js$/.test(rel)) {
  runs.push(['tests/window-globals-exist.mjs']);
  runs.push(['-e', "import('./tools/pack-edge.mjs').then(async (m) => { const p = await m.versionQueryGuard(); if (p.length) { console.error(p.join('\\n')); process.exit(1); } })"]);
}
if (!runs.length) process.exit(0);

const reds = [];
for (const args of runs) {
  const r = spawnSync('node', args, { cwd: root, encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) {
    const name = args[0] === '-e' ? 'versionQueryGuard (?v= imports)' : args[0];
    reds.push(`✗ ${name} (exit ${r.status ?? 'timeout'}):\n  ` + ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-8).join('\n  '));
  }
}
if (reds.length) { process.stderr.write(`edit-checks: ${rel} broke ${reds.length} guard(s):\n${reds.join('\n')}\n`); process.exit(2); }
