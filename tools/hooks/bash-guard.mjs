// tools/hooks/bash-guard.mjs — PreToolUse hook (Bash | PowerShell): the CLAUDE.md §2 lines, enforced.
//
// Reads the hook payload on stdin and denies a command that crosses a rule no session may cross,
// with the rule as the reason. Everything else passes untouched (no output, exit 0). A guard that
// cannot parse its input lets the command through: the permission system stays the backstop.
// Prove it with: node tools/hooks/bash-guard.mjs --selftest
import { readFileSync } from 'node:fs';

const RULES = [
  /* As a command (line start, or after ; && || | $( ), not prose inside quotes or parentheses. */
  { id: 'no-stash', test: (c) => /(^|[;&|]\s*|\$\(\s*|\n\s*)git(\s+-C\s+("[^"]*"|'[^']*'|\S+))?\s+stash\b/.test(c),
    why: 'CLAUDE.md §2: no `git stash` in any worktree (the stash is repo-global; a pop can take another lane\'s work). Commit WIP on the branch instead.' },
  { id: 'no-force-main', test: (c) => /\bgit\s+push\b[^\n;|&]*(\s--force\b|\s-f\b|\s--force-with-lease\b)[^\n;|&]*\b(main|master)\b|\bgit\s+push\b[^\n;|&]*\s\+[^\s]*:?(refs\/heads\/)?main\b/.test(c),
    why: 'Force-pushing main is never allowed (push = live; history is the record).' },
  { id: 'no-agent-main-push', test: (c, cwd) => inWorktree(cwd) && /\bgit\s+push\b[^\n;|&]*\b(origin\s+main|HEAD:main|:refs\/heads\/main|\smain)\b/.test(c),
    why: 'CLAUDE.md §3.1: agents never touch main. Push your lane branch; the Coordinator integrates.' },
  { id: 'no-worktree-delete', test: (c) => /(rm\s+-[a-z]*r[a-z]*f?|rm\s+-[a-z]*f[a-z]*r|Remove-Item\b[^\n;|]*-Recurse|rmdir\s+\/s)[^\n;|]*worktrees/i.test(c),
    why: 'CLAUDE.md §2: worktrees are never recursively deleted. Recover a lane by re-dispatching into its existing worktree; clean up with `git worktree remove` one at a time.' },
  { id: 'no-skip-hooks', test: (c) => /\bgit\b[^\n;|&]*\s--no-verify\b|\bgit\b[^\n;|&]*\s--no-gpg-sign\b/.test(c),
    why: 'Never skip git hooks or signing; fix what the hook reports.' },
  { id: 'no-secret-print', test: (c) => /\b(cat|type|more|less|head|tail|Get-Content|gc|echo|printf)\b[^\n;|]*(supabase-token|changelog-webhook)/i.test(c),
    why: 'CLAUDE.md §2: secrets are read as file bytes by the tools that need them, never printed.' },
  { id: 'no-agent-apply', test: (c, cwd) => inWorktree(cwd) && /apply-migration\.mjs/.test(c),
    why: 'CLAUDE.md §2: production DB writes are the Coordinator\'s, never an agent\'s. Stage the migration and its §4 self-check; report it.' },
  { id: 'no-apply-midnight', test: (c) => /apply-migration\.mjs/.test(c) && midnightUtc(),
    why: 'CLAUDE.md §2: no applies 00:00–00:10 UTC (the daily rollover).' },
  { id: 'no-agent-deploy', test: (c, cwd) => inWorktree(cwd) && /supabase(@[\w.]+)?\s+functions\s+deploy|deploy-edge\.local\.mjs[^\n]*--deploy/.test(c),
    why: 'CLAUDE.md §3.3: edge deploys are the Coordinator\'s. Report `pack-edge --hash` instead.' },
];

function inWorktree(cwd) { return /[\\/]\.claude[\\/]worktrees[\\/]/.test(String(cwd || '')); }
function midnightUtc() { const d = new Date(); return d.getUTCHours() === 0 && d.getUTCMinutes() < 10; }

export function verdict(command, cwd) {
  const c = String(command || '');
  for (const r of RULES) if (r.test(c, cwd)) return r;
  return null;
}

if (process.argv.includes('--selftest')) {
  const wt = 'R:/the game/the game/.claude/worktrees/agent-x';
  const main = 'R:/the game/the game';
  const cases = [
    ['git stash push -m x', main, 'no-stash'], ['git stash list', main, 'no-stash'], ['cd x && git stash pop', main, 'no-stash'],
    ['git -C "R:/a b" stash', main, 'no-stash'], ['node -e \'console.log("allow has git stash:")\'', main, null],
    ["python - <<'EOF'\nnew='hooks deny the lines (git stash, force-push)'\nEOF", main, null], ['x=$(git stash list)', main, 'no-stash'],
    ['git push --force origin main', main, 'no-force-main'], ['git push origin +HEAD:main', main, 'no-force-main'],
    ['git push origin main', wt, 'no-agent-main-push'], ['git push -q origin HEAD:main', wt, 'no-agent-main-push'],
    ['rm -rf .claude/worktrees/agent-a1', main, 'no-worktree-delete'], ['Remove-Item -Recurse -Force .claude\\worktrees', main, 'no-worktree-delete'],
    ['git commit --no-verify -m x', main, 'no-skip-hooks'], ['cat ~/.supabase-token', main, 'no-secret-print'],
    ['node tools/apply-migration.mjs x.sql', wt, 'no-agent-apply'], ['npx supabase@latest functions deploy hr-accrue', wt, 'no-agent-deploy'],
    // must pass
    ['git push origin main', main, null], ['git push -q origin lane/a-x', wt, null], ['git status', wt, null],
    ['node tools/apply-migration.mjs x.sql', main, midnightUtc() ? 'no-apply-midnight' : null], ['git worktree remove .claude/worktrees/agent-a1', main, null],
    ['node tools/hunt-health.local.mjs', main, null], ['git log --format=%s main..lane/a-x', wt, null],
  ];
  let bad = 0;
  for (const [cmd, cwd, want] of cases) { const got = verdict(cmd, cwd)?.id ?? null; if (got !== want) { bad++; console.log(`✗ ${cmd} @${cwd === wt ? 'worktree' : 'main'}: got ${got}, want ${want}`); } }
  console.log(bad ? `bash-guard selftest RED: ${bad} of ${cases.length}` : `bash-guard selftest green: ${cases.length} cases`);
  process.exit(bad ? 1 : 0);
}

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch (e) { process.exit(0); }
const hit = verdict(input.tool_input && input.tool_input.command, input.cwd);
if (hit) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny',
    permissionDecisionReason: `Blocked by tools/hooks/bash-guard.mjs [${hit.id}]: ${hit.why}` } }));
}
