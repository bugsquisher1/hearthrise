// tools/notes-draft.local.mjs — the raw material for a release's CHANGELOG entry and Discord note.
//
//   node tools/notes-draft.local.mjs 0.2.21            from set/v0.2.21 (else HEAD) vs origin/main
//
// Lists each merged lane with its fix:/feat: commit subjects, then writes a skeleton to
// .claude/notes-vX.Y.Z.md: a "## vX.Y.Z — date (Title)" entry and a Discord note with its length
// against the 2000-char cap. The wording stays a human job (player-facing words, CLAUDE.md §3.3a);
// this only saves re-reading the git log. Local tool, not in CI.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const ver = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(ver)) { console.error('usage: node tools/notes-draft.local.mjs X.Y.Z'); process.exit(2); }
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let head = `set/v${ver}`;
try { git('rev-parse', '--verify', '-q', head); } catch (e) { head = 'HEAD'; }

const merges = git('log', '--merges', '--first-parent', '--format=%H %s', `origin/main..${head}`).split('\n').filter(Boolean);
const lanes = merges.map((l) => { const [sha, ...s] = l.split(' '); return { sha, title: s.join(' ').replace(/^merge:\s*/, '').replace(/ into .*$/, '') }; });
const pick = (range) => git('log', '--no-merges', '--format=%s', range).split('\n').filter((s) => /^(fix|feat|content|perf)(\(|:)/.test(s));
const out = [];
for (const l of lanes) {
  const subs = pick(`${l.sha}^1..${l.sha}^2`);
  out.push(`${l.title}\n` + (subs.length ? subs.map((s) => '  - ' + s).join('\n') : '  (no fix/feat commits)'));
}
if (!lanes.length) out.push('Direct commits:\n' + pick(`origin/main..${head}`).map((s) => '  - ' + s).join('\n'));
console.log(`v${ver} from ${head}: ${lanes.length} lanes\n\n` + out.join('\n\n'));

const date = new Date().toISOString().slice(0, 10);
const discord = `**Hearthrise v${ver}**\n` + '- …one line per player-visible change, in player words…\n';
const file = `.claude/notes-v${ver}.md`;
writeFileSync(file, `## v${ver} — ${date} (Title)\n\n**Headline.** One or two sentences in player words.\n\n<!-- raw material -->\n<!--\n${out.join('\n\n')}\n-->\n\n---\nDiscord (${discord.length}/2000):\n\n${discord}`);
console.log(`\nSkeleton written to ${file}`);
