#!/usr/bin/env node
// tests/apply-order-split.mjs — THE APPLY ORDER MERGES WITHOUT CONFLICTS (r36, 2026-10-21).
//
//   node tests/apply-order-split.mjs             the proof (credential-free, a throwaway git repo)
//   node tests/apply-order-split.mjs --selftest  the same run; its CONTROL is the planted defect
//
// tests/schema-apply-order.json was the #1 merge-conflict source: every migration lane
// appended to the same `order` array tail and `_order_notes` object, so two lanes that each
// added one migration ALWAYS conflicted (244 commits touched it in three weeks). The order
// is now one file per migration (tools/lib/apply-order.mjs). This proves, in a real git repo:
//
//   S1  two branches that each place one migration merge into main with ZERO conflict hunks,
//       and the merged order is deterministic (seq tie → name).
//   S2  CONTROL — the same two edits on the OLD single-file shape DO conflict. If they stop
//       conflicting, S1 proves nothing about the split; this is the planted defect S1 must beat.
//   S3  the loader orders by seq NUMERICALLY (10 < 9.5? no: 9.5 < 10 < 100), then name —
//       never by filename or date.
//   S4  `tools/apply-order-split.mjs --migrate` converts a lane that still edits the old JSON:
//       its new entry + note survive, main's newer entry and APPLIED flip survive, and the
//       lane then merges into main with zero conflicts.
//   S5  --migrate REFUSES when both sides changed the same note differently (merge aborted,
//       tree clean) — a tool never picks a side.
//
// Exit: 0 green · 1 a failed property · 2 a harness problem (git missing).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadApplyOrder, writeApplyOrder, writeEntry, readEntries, nextSeq, sortEntries } from '../tools/lib/apply-order.mjs';
import { migrate } from '../tools/apply-order-split.mjs';

let fails = 0;
const ok = (c, m, extra = '') => { console.log(`${c ? '  ok  ' : '  ✗   '}${m}${extra && !c ? '\n       ' + extra : ''}`); if (!c) fails++; };

const tmpRoots = [];
function repo() {
  const d = mkdtempSync(join(tmpdir(), 'hr-apply-order-'));
  tmpRoots.push(d);
  const g = (...a) => execFileSync('git', a, { cwd: d, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  g('init', '-q', '-b', 'main');
  g('config', 'user.name', 'apply-order-split test');
  g('config', 'user.email', 'test@invalid');
  g('config', 'commit.gpgsign', 'false');
  mkdirSync(join(d, 'supabase', 'migrations'), { recursive: true });
  return { d, g, tryG: (...a) => { try { return { ok: true, out: g(...a) }; } catch (e) { return { ok: false, out: String(e.stdout || '') + String(e.stderr || '') }; } } };
}
const OLD = (order, notes) => ({ _readme: ['fixture'], gucs: {}, pre_schema: [], _pre_schema_why: [], order, _order_notes: notes, excluded: {} });
const sql = (d, f) => writeFileSync(join(d, 'supabase', 'migrations', f), `-- ${f}\nselect 1;\n`);
const conflicts = (g) => g('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
const commitAll = (g, m) => { g('add', '-A'); g('commit', '-q', '-m', m); };

function placeOne(d, f, note) {
  sql(d, f);
  writeEntry(d, f, nextSeq(readEntries(d).entries), note);
}

try {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); }
  catch { console.error('HARNESS: git is not on PATH'); process.exit(2); }

  // ── S1: the split merges clean ─────────────────────────────────────────────
  {
    const { d, g, tryG } = repo();
    for (const f of ['2026-01-01-a.sql', '2026-01-01-b.sql']) sql(d, f);
    writeApplyOrder(d, OLD(['2026-01-01-b.sql', '2026-01-01-a.sql'], { '2026-01-01-b.sql': 'APPLIED' }));
    commitAll(g, 'base');
    g('checkout', '-q', '-b', 'lane/x');
    placeOne(d, '2026-01-02-x.sql', 'STAGED, NOT APPLIED — lane x');
    commitAll(g, 'x');
    g('checkout', '-q', 'main'); g('checkout', '-q', '-b', 'lane/y');
    placeOne(d, '2026-01-02-w.sql', 'STAGED, NOT APPLIED — lane y');
    commitAll(g, 'y');
    g('checkout', '-q', 'main');
    const m1 = tryG('merge', '--no-ff', '-q', '-m', 'merge x', 'lane/x');
    const m2 = tryG('merge', '--no-ff', '-q', '-m', 'merge y', 'lane/y');
    ok(m1.ok && m2.ok && conflicts(g).length === 0, 'S1 two lanes each placing one migration merge into main with zero conflicts', m1.out + m2.out);
    const order = loadApplyOrder(d).order;
    ok(JSON.stringify(order) === JSON.stringify(['2026-01-01-b.sql', '2026-01-01-a.sql', '2026-01-02-w.sql', '2026-01-02-x.sql']),
      'S1 merged order: history kept, the two seq-30 entries tie-broken by name', JSON.stringify(order));
    ok(/lane x/.test(loadApplyOrder(d)._order_notes['2026-01-02-x.sql']) && /lane y/.test(loadApplyOrder(d)._order_notes['2026-01-02-w.sql']), 'S1 both lanes\' notes survive');
  }

  // ── S2: CONTROL — the old single file conflicts on the same two edits ─────────
  {
    const { d, g, tryG } = repo();
    const P = join(d, 'tests', 'schema-apply-order.json');
    mkdirSync(join(d, 'tests'), { recursive: true });
    const write = (o) => writeFileSync(P, JSON.stringify(o, null, 2) + '\n');
    const base = OLD(['2026-01-01-b.sql', '2026-01-01-a.sql'], { '2026-01-01-b.sql': 'APPLIED' });
    write(base); commitAll(g, 'base');
    g('checkout', '-q', '-b', 'lane/x');
    write(OLD([...base.order, '2026-01-02-x.sql'], { ...base._order_notes, '2026-01-02-x.sql': 'STAGED x' })); commitAll(g, 'x');
    g('checkout', '-q', 'main'); g('checkout', '-q', '-b', 'lane/y');
    write(OLD([...base.order, '2026-01-02-w.sql'], { ...base._order_notes, '2026-01-02-w.sql': 'STAGED y' })); commitAll(g, 'y');
    g('checkout', '-q', 'main');
    tryG('merge', '--no-ff', '-q', '-m', 'merge x', 'lane/x');
    const m2 = tryG('merge', '--no-ff', '-q', '-m', 'merge y', 'lane/y');
    ok(!m2.ok && conflicts(g).includes('tests/schema-apply-order.json'),
      'S2 CONTROL: the same two edits on the old single JSON conflict (what S1 must beat)', m2.out);
    tryG('merge', '--abort');
  }

  // ── S3: seq is numeric, then name ─────────────────────────────────────────
  {
    const got = sortEntries([{ file: 'b.sql', seq: 100 }, { file: 'a.sql', seq: 10 }, { file: 'z.sql', seq: 9.5 }, { file: 'c.sql', seq: 10 }]).map((e) => e.file);
    ok(JSON.stringify(got) === JSON.stringify(['z.sql', 'a.sql', 'c.sql', 'b.sql']), 'S3 order = seq numerically, ties by name', JSON.stringify(got));
    ok(nextSeq([{ seq: 3770 }, { seq: 2345.5 }]) === 3780 && nextSeq([{ seq: 3775 }]) === 3780 && nextSeq([]) === 10, 'S3 --add places at the next multiple of 10 past the last');
  }

  // ── S4: --migrate converts a lane still on the old JSON ─────────────────────
  {
    const { d, g, tryG } = repo();
    const P = join(d, 'tests', 'schema-apply-order.json');
    mkdirSync(join(d, 'tests'), { recursive: true });
    for (const f of ['2026-01-01-a.sql', '2026-01-01-b.sql', '2026-01-01-c.sql']) sql(d, f);
    const base = OLD(['2026-01-01-a.sql', '2026-01-01-b.sql', '2026-01-01-c.sql'], { '2026-01-01-c.sql': 'STAGED, NOT APPLIED — c' });
    writeFileSync(P, JSON.stringify(base, null, 2) + '\n'); commitAll(g, 'base (old json)');
    // the lane, branched before the split, appends d to the OLD file
    g('checkout', '-q', '-b', 'lane/d');
    sql(d, '2026-01-03-d.sql');
    writeFileSync(P, JSON.stringify({ ...base, order: [...base.order, '2026-01-03-d.sql'], _order_notes: { ...base._order_notes, '2026-01-03-d.sql': 'STAGED, NOT APPLIED — d' } }, null, 2) + '\n');
    commitAll(g, 'lane d');
    // main splits, places e, and the Coordinator flips c to APPLIED
    g('checkout', '-q', 'main');
    writeApplyOrder(d, base); rmSync(P);
    commitAll(g, 'split');
    placeOne(d, '2026-01-02-e.sql', 'STAGED, NOT APPLIED — e');
    writeEntry(d, '2026-01-01-c.sql', 30, 'APPLIED 2026-01-02 — c');
    commitAll(g, 'e + flip c');
    g('checkout', '-q', 'lane/d');
    const r = migrate(d, 'main');
    ok(r.ok, 'S4 --migrate converts the lane (merge + entry files, committed)', r.msg);
    ok(!existsSync(P), 'S4 the old JSON is gone on the lane');
    const lane = loadApplyOrder(d);
    ok(JSON.stringify(lane.order) === JSON.stringify(['2026-01-01-a.sql', '2026-01-01-b.sql', '2026-01-01-c.sql', '2026-01-02-e.sql', '2026-01-03-d.sql']),
      'S4 order: main\'s e kept, the lane\'s d appended after it', JSON.stringify(lane.order));
    ok(/^APPLIED/.test(lane._order_notes['2026-01-01-c.sql']) && /— d$/.test(lane._order_notes['2026-01-03-d.sql']), 'S4 main\'s APPLIED flip and the lane\'s note both survive');
    g('checkout', '-q', 'main');
    const m = tryG('merge', '--no-ff', '-q', '-m', 'merge lane d', 'lane/d');
    ok(m.ok && conflicts(g).length === 0, 'S4 the converted lane merges into main with zero conflicts', m.out);
  }

  // ── S5: --migrate refuses a same-note edit on both sides ────────────────────
  {
    const { d, g } = repo();
    const P = join(d, 'tests', 'schema-apply-order.json');
    mkdirSync(join(d, 'tests'), { recursive: true });
    for (const f of ['2026-01-01-a.sql', '2026-01-01-c.sql']) sql(d, f);
    const base = OLD(['2026-01-01-a.sql', '2026-01-01-c.sql'], { '2026-01-01-c.sql': 'STAGED — c' });
    writeFileSync(P, JSON.stringify(base, null, 2) + '\n'); commitAll(g, 'base');
    g('checkout', '-q', '-b', 'lane/c');
    writeFileSync(P, JSON.stringify({ ...base, _order_notes: { '2026-01-01-c.sql': 'STAGED — c, re-reviewed by the lane' } }, null, 2) + '\n');
    commitAll(g, 'lane edits c');
    g('checkout', '-q', 'main');
    writeApplyOrder(d, base); rmSync(P); writeEntry(d, '2026-01-01-c.sql', 20, 'APPLIED — c'); commitAll(g, 'split + flip');
    g('checkout', '-q', 'lane/c');
    const head = g('rev-parse', 'HEAD').trim();
    const r = migrate(d, 'main');
    ok(!r.ok && /both sides/.test(r.msg), 'S5 --migrate refuses a note both sides changed', r.msg);
    ok(g('rev-parse', 'HEAD').trim() === head && !g('status', '--porcelain').trim() && !existsSync(join(d, '.git', 'MERGE_HEAD')),
      'S5 …and leaves the lane exactly as it was (merge aborted, tree clean)');
  }
} finally {
  for (const d of tmpRoots) { try { rmSync(d, { recursive: true, force: true }); } catch { /* a temp dir */ } }
}

console.log(fails ? `\napply-order-split: ${fails} propert${fails === 1 ? 'y' : 'ies'} FAILED` : '\napply-order-split: every property holds');
process.exit(fails ? 1 : 0);
