// ════════════════════════════════════════════════════════════════════════
// tools/lib/ci-register.mjs — A GUARD REGISTERS ITSELF IN CI WITH TWO HEADER LINES (architecture audit 2026-11-19, row 8).
//
// THE COST. .github/workflows/smoke.yml is the most contended file in the repository: 8,313 lines, 32 touches and
// 56,689 changed lines in three weeks, one hand edit per new guard, and a conflict for every two lanes that each
// added one. So a guard says where it runs, in its own file, and the workflow's steps for it are GENERATED:
//
//     // ci-step: <job> | <step name>
//     // ci-run: <command>
//     // ci-run: <command>            (one line per command, in order; a file may hold several ci-step blocks)
//
// `node tests/ci-shape.mjs --write` writes every such step into one region at the end of its job:
//
//       # ── SELF-REGISTERED GUARDS … ──
//       # tests/x.mjs
//       - name: <step name>
//         if: ${{ !cancelled() }}
//         run: |
//           <command>
//       # ── END SELF-REGISTERED GUARDS ──
//
// and CI-SHAPE-13 is red when the file is not what the headers generate: a header naming a job the workflow lacks,
// a generated step whose guard no longer carries its header, a region edited by hand, or a header not written yet.
// Steps not yet registered by header stay hand-written; they move to headers as their guards are touched.
//
// Pure but for readHeaders (it reads tests/ and tools/). No dependency on the workflow parser.
// ════════════════════════════════════════════════════════════════════════
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REGION_OPEN = '      # ── SELF-REGISTERED GUARDS: generated from each guard\'s `// ci-step:` header by `node tests/ci-shape.mjs --write`; never hand-edited ──';
export const REGION_CLOSE = '      # ── END SELF-REGISTERED GUARDS ──';
const STEP = /^\/\/ ci-step:\s*(.*?)\s*$/;
const RUN = /^\/\/ ci-run:\s*(.*?)\s*$/;
const JOB = /^ {2}([A-Za-z0-9_-]+):\s*$/;

/** The ci-step blocks of one file: { steps: [{ file, line, job, name, run }], errors: [{ file, line, message }] }. */
export function headerSteps(file, text) {
  const steps = [], errors = [];
  let cur = null;
  text.split(/\r?\n/).forEach((l, i) => {
    const s = STEP.exec(l), r = RUN.exec(l);
    if (s) {
      const [job, name] = s[1].split('|').map((x) => x.trim());
      if (!job || !name || !/^[A-Za-z0-9_-]+$/.test(job)) { errors.push({ file, line: i + 1, message: `"${l}" is not "// ci-step: <job> | <step name>"` }); cur = null; return; }
      /* The name is written as a plain YAML scalar (`- name: <name>`). A ": " or " #" inside it, or a YAML indicator first,
         makes GitHub refuse the WHOLE workflow ("a workflow file issue": no job runs, every push fails), while our own
         lenient parser reads it fine (2026-11-22, tests/needs-you.mjs). Refuse it here, where the author can fix it. */
      if (/: | #|:$/.test(name) || /^[-?:,[\]{}#&*!|>'"%@`]/.test(name)) { errors.push({ file, line: i + 1, message: `ci-step name "${name}" is not a safe plain YAML value: GitHub would refuse the whole workflow. No ": " or " #" inside it and no YAML indicator first; use a dash in place of the colon` }); cur = null; return; }
      cur = { file, line: i + 1, job, name, run: [] };
      steps.push(cur);
    } else if (r) {
      if (!cur) errors.push({ file, line: i + 1, message: '"// ci-run:" with no "// ci-step:" above it' });
      else if (!r[1]) errors.push({ file, line: i + 1, message: '"// ci-run:" with no command' });
      else cur.run.push(r[1]);
    }
  });
  for (const s of steps) if (!s.run.length) errors.push({ file, line: s.line, message: `ci-step "${s.name}" has no "// ci-run:" line` });
  return { steps: steps.filter((s) => s.run.length), errors };
}

/** Every .mjs under tests/ and tools/ (not node_modules, not fixtures), relative, sorted. */
function guardFiles(root) {
  const out = [];
  const walk = (rel) => {
    for (const d of readdirSync(join(root, rel), { withFileTypes: true })) {
      const p = `${rel}/${d.name}`;
      if (d.isDirectory()) { if (!/^(node_modules|fixtures|\.)/.test(d.name)) walk(p); } else if (d.name.endsWith('.mjs')) out.push(p);
    }
  };
  for (const top of ['tests', 'tools']) walk(top);
  return out.sort();
}

/** Every header in the repository: { steps, errors }, steps ordered by file then line. */
export function readHeaders(root) {
  const steps = [], errors = [];
  for (const f of guardFiles(root)) {
    const text = readFileSync(join(root, f), 'utf8');
    if (!text.includes('// ci-')) continue;
    const h = headerSteps(f, text);
    steps.push(...h.steps); errors.push(...h.errors);
  }
  return { steps, errors };
}

const render = (s) => [`      # ${s.file}`, `      - name: ${s.name}`, '        if: ${{ !cancelled() }}', '        run: |', ...s.run.map((c) => `          ${c}`)];

/** The text with every region removed (and the blank line written before it). LF in, LF out. */
export function stripRegions(text) {
  const ls = text.split('\n');
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (ls[i] !== REGION_OPEN) { out.push(ls[i]); continue; }
    if (out.length && out[out.length - 1] === '') out.pop();
    while (i < ls.length && ls[i] !== REGION_CLOSE) i++;
  }
  return out.join('\n');
}

/**
 * The workflow as the headers write it: { text, problems: [{ message }] }. `text` is LF; the caller keeps the file's own
 * line ends. A header whose job is not in the file is a problem and generates nothing.
 */
export function generate(workflowText, steps) {
  const problems = [];
  const ls = stripRegions(workflowText.split('\r\n').join('\n')).split('\n');
  const jobsAt = ls.findIndex((l) => /^jobs:\s*$/.test(l));
  const heads = [];
  for (let i = jobsAt + 1; jobsAt >= 0 && i < ls.length; i++) {
    if (/^\S/.test(ls[i])) break;
    const m = JOB.exec(ls[i]);
    if (m) heads.push({ name: m[1], at: i });
  }
  const end = jobsAt < 0 ? ls.length : (() => { for (let i = jobsAt + 1; i < ls.length; i++) if (/^\S/.test(ls[i])) return i; return ls.length; })();
  const byJob = new Map();
  for (const s of steps) {
    if (!heads.some((h) => h.name === s.job)) { problems.push({ message: `${s.file}:${s.line} registers "${s.name}" in job "${s.job}", which smoke.yml does not have (a header without a job)` }); continue; }
    if (!byJob.has(s.job)) byJob.set(s.job, []);
    byJob.get(s.job).push(s);
  }
  /* back to front, so earlier indices hold */
  for (let k = heads.length - 1; k >= 0; k--) {
    const mine = byJob.get(heads[k].name);
    if (!mine) continue;
    const stop = k + 1 < heads.length ? heads[k + 1].at : end;
    let last = stop - 1;
    while (last > heads[k].at && !/^ {4,}\S/.test(ls[last])) last--;
    ls.splice(last + 1, 0, '', REGION_OPEN, ...mine.flatMap(render), REGION_CLOSE);
  }
  return { text: ls.join('\n'), problems };
}

/** The steps a region in `text` holds: [{ file, name, run }] (what CI-SHAPE-13 names when the file and the headers differ). */
export function regionSteps(text) {
  const out = [];
  let inside = false, cur = null, inRun = false;
  for (const l of text.split('\r\n').join('\n').split('\n')) {
    if (l === REGION_OPEN) { inside = true; continue; }
    if (l === REGION_CLOSE) { inside = false; cur = null; continue; }
    if (!inside) continue;
    const f = /^ {6}# (\S+)$/.exec(l), n = /^ {6}- name: (.*)$/.exec(l);
    if (f) { cur = { file: f[1], name: null, run: [] }; out.push(cur); inRun = false; } else if (n) {
      if (!cur || cur.name !== null) { cur = { file: null, name: n[1], run: [] }; out.push(cur); } else cur.name = n[1];
      inRun = false;
    } else if (/^ {8}run: \|$/.test(l)) inRun = true;
    else if (/^ {8}run: (.+)$/.test(l) && cur) cur.run.push(/^ {8}run: (.+)$/.exec(l)[1]);
    else if (inRun && cur && /^ {10}\S/.test(l)) cur.run.push(l.trim());
  }
  return out;
}
