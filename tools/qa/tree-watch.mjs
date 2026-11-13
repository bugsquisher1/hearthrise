// tools/qa/tree-watch.mjs — RUN ONE COMMAND AND SAY WHAT IT WROTE INTO THE WORKING TREE.
//
//   node tools/qa/tree-watch.mjs <out.json> <anchor,anchor,...|-> -- node tests/x.mjs --mutate
//
// For a proof's `mutant-writes-tree: no` (tools/guard-anchors.mjs): a proof that plants into the real tree
// and restores it inside a few ms leaves `git status` clean, so status alone proves nothing. Two eyes:
//   1. a recursive fs.watch of the repository, each event judged against a stat of every file git knows
//      (tracked and untracked, not ignored) taken before the command starts: a new mtime or size, or a new
//      path, is a WRITE; an event with neither is a read;
//   2. a 10 ms poll of the anchor files given (the guard's mutant anchors: `catalogue()` in guard-anchors).
// Proved 11-10 (lane a-ci-first-run): a 5 ms plant-and-restore in src/session/envelope.js is one WRITE and two
// anchor changes while git status stays clean; 50 reads of it are silent. A gitignored path written (the PGlite
// cache, tests/.pglite-cache) shows as `ignored`. Run ONE at a time: a second process's writes are counted too.
// Exit 0 nothing written but ignored paths · 1 a write, an anchor change or a changed status · 2 usage.
import { watch, statSync, writeFileSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const [out, anchorArg, dash, ...cmd] = process.argv.slice(2);
if (dash !== '--' || !cmd.length) { console.error('usage: node tools/qa/tree-watch.mjs <out.json> <anchors|-> -- <command…>'); process.exit(2); }
const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1e8 }).stdout || '';
const st = (abs) => { try { const s = statSync(abs); return { m: s.mtimeMs, z: s.size }; } catch { return null; } };

const base = new Map(git(['ls-files', '-co', '--exclude-standard', '-z']).split('\0').filter(Boolean)
  .map((f) => [f.replace(/\\/g, '/'), st(join(root, f))]));
const statusBefore = git(['status', '--porcelain', '-uall']);
const anchors = new Map((anchorArg === '-' ? [] : anchorArg.split(',').filter(Boolean)).map((a) => [a, st(join(root, a))]));

const t0 = Date.now();
const events = [];
const watcher = watch(root, { recursive: true }, (type, name) => {
  const rel = String(name || '').replace(/\\/g, '/');
  if (rel && rel !== '.git' && !rel.startsWith('.git/')) events.push({ t: Date.now() - t0, rel, now: st(join(root, rel)) });
});
const polled = [];
const poll = setInterval(() => {
  for (const [a, was] of anchors) {
    const now = st(join(root, a));
    if (JSON.stringify(now) !== JSON.stringify(was)) { polled.push({ t: Date.now() - t0, rel: a }); anchors.set(a, now); }
  }
}, 10);

const child = spawn(cmd[0] === 'node' ? process.execPath : cmd[0], cmd.slice(1), { cwd: root, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
child.on('close', async (code) => {
  await new Promise((r) => setTimeout(r, 300)); // the last events land
  clearInterval(poll); watcher.close();
  const writes = new Map();
  for (const e of events) {
    try { if (statSync(join(root, e.rel)).isDirectory()) continue; } catch { /* gone: still judged */ }
    const was = base.get(e.rel);
    const ignored = (rel) => spawnSync('git', ['check-ignore', '-q', rel], { cwd: root }).status === 0;
    const kind = was === undefined ? (writes.has(e.rel) ? writes.get(e.rel).kind : ignored(e.rel) ? 'ignored' : 'new')
      : JSON.stringify(e.now) !== JSON.stringify(was) ? 'changed' : null;
    if (!kind) continue;
    if (!writes.has(e.rel)) writes.set(e.rel, { rel: e.rel, kind, firstMs: e.t, events: 0, existsAfter: existsSync(join(root, e.rel)) });
    writes.get(e.rel).events++;
  }
  const statusSame = git(['status', '--porcelain', '-uall']) === statusBefore;
  const res = { cmd: cmd.join(' '), code, seconds: (Date.now() - t0) / 1000, events: events.length, writes: [...writes.values()], polled, statusSame };
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(`\nTREE-WATCH ${res.cmd}: exit ${code}, ${res.seconds.toFixed(1)} s, ${res.writes.length} path(s) written, `
    + `${polled.length} anchor change(s), git status ${statusSame ? 'unchanged' : 'CHANGED'}`);
  for (const w of res.writes.slice(0, 40)) console.log(`  WRITE ${w.kind} ${w.rel} (+${w.firstMs} ms, ${w.events} event(s), there after: ${w.existsAfter})`);
  for (const p of polled.slice(0, 40)) console.log(`  ANCHOR ${p.rel} +${p.t} ms`);
  /* Exit 1: a tracked or untracked file was written, an anchor moved, or the status changed. A gitignored write (a cache) is 0. */
  process.exit(res.writes.some((w) => w.kind !== 'ignored') || polled.length || !statusSame ? 1 : 0);
});
