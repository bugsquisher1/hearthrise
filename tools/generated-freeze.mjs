// ════════════════════════════════════════════════════════════════════════
// tools/generated-freeze.mjs — CATALOGUE GROWTH IS APPEND-ONLY.
//
// A generated migration that production has APPLIED is history. Before this
// module every gen-* tool rewrote its file in place, so adding one crop or one
// shield changed the bytes of a migration applied weeks ago — and, because the
// replay applies that file at its OLD position, every later migration that
// pinned a count at its own apply time (a prayer bench of 13, a smithing bench
// of 115, the exact start kit) saw the NEW catalogue and refused. Editing those
// later files to "accept the new count" would loosen a guard and rewrite
// history; both are forbidden (CLAUDE.md §2). Coordinator ruling 2026-10-08.
//
// THE RULE. A file registered in tests/generated-frozen.json is FROZEN at the
// bytes pinned there. A generator that would produce different rows for it
// writes them instead to an OPEN DELTA — `<date>-<stem>.delta.generated.sql`,
// appended at the END of tests/schema-apply-order.json `order` — holding only
// the rows that changed, as idempotent upserts (and keyed deletes), plus an
// executed self-check. Once the Coordinator applies a delta it is pinned in the
// registry too (`deltaOf`) and becomes part of the frozen base; the next change
// opens a new delta.
//
// WHAT A DELTA CAN AND CANNOT CARRY. Rows, yes: any tuple of an
// `insert into public.T (…) values` block or an `update … from (values …)`
// block. Structure, no: if the generator's non-row text (tables, columns,
// grants, functions, self-check SHAPE) changes beyond counts and digests, the
// change is not a data row and needs a hand-authored migration — `--check`
// fails and says so rather than freezing a lie.
//
// PURE Node ESM. No database. Used by every gen-* tool that writes a
// `.generated.sql`; guarded by tests/generated-frozen.mjs.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, normalize, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const MIG = join(ROOT, 'supabase', 'migrations');
const REGISTRY = join(ROOT, 'tests', 'generated-frozen.json');
const ORDER = join(ROOT, 'tests', 'schema-apply-order.json');

function readRegistry() { return JSON.parse(readFileSync(REGISTRY, 'utf8')); }

/** Split one tuple `( a, 'b, c', now() )` into its top-level fields. */
function splitTuple(t) {
  const s = t.trim();
  if (s[0] !== '(' || s[s.length - 1] !== ')') throw new Error('not a tuple: ' + s);
  const out = []; let cur = ''; let q = false; let d = 0;
  for (let i = 1; i < s.length - 1; i++) {
    const c = s[i];
    if (q) { cur += c; if (c === "'") { if (s[i + 1] === "'") { cur += s[++i]; } else q = false; } continue; }
    if (c === "'") { q = true; cur += c; continue; }
    if (c === '(') d++;
    if (c === ')') d--;
    if (c === ',' && d === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}
const canon = (t) => '(' + splitTuple(t).join(', ') + ')';

/** Primary keys from the file's own `create table` statements. */
function primaryKeys(sql) {
  const pk = {};
  const re = /create table (?:if not exists )?public\.(\w+) \(([\s\S]*?)\n\s*\);/g;
  let m;
  while ((m = re.exec(sql))) {
    const body = m[2];
    const multi = body.match(/primary key \(([^)]+)\)/);
    if (multi) { pk[m[1]] = multi[1].split(',').map((x) => x.trim()); continue; }
    const one = body.split('\n').find((l) => /\bprimary key\b/.test(l));
    if (one) pk[m[1]] = [one.trim().split(/\s+/)[0]];
  }
  return pk;
}

/** Parse row blocks + the frame (every line that is not a tuple). */
function parseGenerated(sql) {
  const lines = sql.replace(/\r\n/g, '\n').split('\n');
  const blocks = []; const frame = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    let m;
    if ((m = L.match(/^insert into public\.(\w+) \(([^)]*)\) values$/))) {
      frame.push(L);
      const b = { kind: 'insert', table: m[1], cols: m[2].split(',').map((x) => x.trim()), header: [L], tuples: [], tail: [] };
      let j = i + 1;
      while (j < lines.length && /^\s*\(/.test(lines[j])) {
        let t = lines[j].trim(); const end = t.endsWith(';');
        t = t.replace(/[,;]$/, '');
        b.tuples.push(canon(t)); j++;
        if (end) { b.tail.push(';'); break; }
      }
      if (!b.tail.length) { while (j < lines.length) { b.tail.push(lines[j]); frame.push(lines[j]); if (lines[j].trim().endsWith(';')) break; j++; } }
      else j--;                                   // j sat one past the closing tuple
      blocks.push(b); i = j; continue;
    }
    if ((m = L.match(/^insert into public\.(\w+) \(([^)]*)\)$/)) && /^\s*values \(/.test(lines[i + 1] || '')) {
      frame.push(L);
      const b = { kind: 'insert', table: m[1], cols: m[2].split(',').map((x) => x.trim()), header: [L], tuples: [], tail: [] };
      let j = i + 1; let txt = lines[j].replace(/^\s*values /, ''); let depth = 0;
      const bal = (s) => { let q = false; for (let k = 0; k < s.length; k++) { const c = s[k]; if (c === "'") q = !q; else if (!q && c === '(') depth++; else if (!q && c === ')') depth--; } };
      bal(txt);
      while (depth > 0) { j++; txt += ' ' + lines[j].trim(); bal(' ' + lines[j].trim()); }
      const close = txt.lastIndexOf(')');
      b.tuples.push(canon(txt.slice(0, close + 1)));
      const rest = txt.slice(close + 1).trim();
      j++;
      if (rest.endsWith(';')) b.tail.push(rest);
      else { while (j < lines.length) { b.tail.push(lines[j]); frame.push(lines[j]); if (lines[j].trim().endsWith(';')) break; j++; } }
      blocks.push(b); i = j; continue;
    }
    if ((m = L.match(/^update public\.(\w+) as (\w+) set (.*)$/)) && /^\s*from \(values$/.test(lines[i + 1] || '')) {
      frame.push(L, lines[i + 1]);
      const b = { kind: 'update', table: m[1], header: [L, lines[i + 1]], tuples: [], tail: [] };
      let j = i + 2;
      while (j < lines.length && /^\s*\(/.test(lines[j])) { b.tuples.push(canon(lines[j].trim().replace(/,$/, ''))); j++; }
      const alias = (lines[j] || '').match(/^\s*\) as \w+\(([^)]*)\)/);
      if (!alias) throw new Error('update block without a values alias: ' + L);
      b.cols = alias[1].split(',').map((x) => x.trim());
      while (j < lines.length) { b.tail.push(lines[j]); frame.push(lines[j]); if (lines[j].trim().endsWith(';')) break; j++; }
      blocks.push(b); i = j; continue;
    }
    if ((m = L.match(/^delete from public\.(\w+) where \(([^)]*)\) in \($/))) {
      const b = { kind: 'delete', table: m[1], cols: m[2].split(',').map((x) => x.trim()), tuples: [] };
      let j = i + 1;
      while (j < lines.length && /^\s*\(/.test(lines[j])) { b.tuples.push(canon(lines[j].trim().replace(/,$/, ''))); j++; }
      blocks.push(b); i = j; continue;
    }
    frame.push(L);
  }
  return { blocks, frame, pk: primaryKeys(sql) };
}

const blockId = (b) => b.kind + ':' + b.table + ':' + (b.kind === 'update' ? b.header[0] : '');
const normFrame = (lines) => lines.join('\n')
  .replace(/\b[0-9a-f]{64}\b/g, 'H').replace(/\b\d+(\.\d+)?\b/g, 'N');

/** The applied state of a frozen base: its rows, then every pinned delta's. */
function appliedState(baseFile, reg) {
  const base = parseGenerated(readFileSync(join(MIG, baseFile), 'utf8'));
  const state = new Map();
  const keyOf = (b, t) => {
    const k = b.kind === 'update' ? [0] : (base.pk[b.table] || []).map((c) => b.cols.indexOf(c));
    if (b.kind === 'insert' && (!k.length || k.some((x) => x < 0))) return t;   // no pk: the whole tuple is the key
    const f = splitTuple(t); return k.map((x) => f[x]).join('|');
  };
  for (const b of base.blocks) state.set(blockId(b), { b, rows: new Map(b.tuples.map((t) => [keyOf(b, t), t])) });
  const deltas = Object.entries(reg.files).filter(([, v]) => v.deltaOf === baseFile).map(([f]) => f).sort();
  for (const f of deltas) {
    for (const b of parseGenerated(readFileSync(join(MIG, f), 'utf8')).blocks) {
      if (b.kind === 'delete') {
        for (const [id, s] of state) if (id.split(':')[1] === b.table) b.tuples.forEach((t) => s.rows.delete(splitTuple(t).join('|')));
        continue;
      }
      const s = state.get(blockId(b)); if (!s) continue;
      b.tuples.forEach((t) => s.rows.set(keyOf(s.b, t), t));
    }
  }
  return { base, state, keyOf };
}

const deltaStem = (baseFile) => baseFile.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.generated\.sql$/, '');
function openDeltaFiles(baseFile, reg) {
  const stem = deltaStem(baseFile);
  const re = new RegExp('^\\d{4}-\\d{2}-\\d{2}-' + stem.replace(/[.-]/g, '\\$&') + '\\.delta\\.generated\\.sql$');
  return readdirSync(MIG).filter((f) => re.test(f) && !reg.files[f]).sort();
}

/** Build the delta SQL for `fullSql` against the frozen `baseFile`. '' = nothing changed. */
function buildDelta(baseFile, fullSql, reg = readRegistry()) {
  const { base, state, keyOf } = appliedState(baseFile, reg);
  const full = parseGenerated(fullSql);
  if (normFrame(full.frame) !== normFrame(base.frame)) {
    const a = normFrame(base.frame).split('\n'); const b = normFrame(full.frame).split('\n');
    let k = 0; while (k < a.length && a[k] === b[k]) k++;
    throw new Error(`${baseFile} is FROZEN and the generator changed its STRUCTURE (not only rows) near line ${k + 1}: `
      + JSON.stringify(b[k] || '') + ' — a structural change needs a hand-authored migration, not a delta.');
  }
  const ups = []; const dels = []; const checks = []; const counts = [];
  const owned = new Set(base.frame.map((l) => (l.match(/^(?:delete from|truncate table) public\.(\w+);$/) || [])[1]).filter(Boolean));
  for (const fb of full.blocks) {
    const s = state.get(blockId(fb));
    if (!s) throw new Error(`${baseFile}: block ${blockId(fb)} is new — structural, needs a hand-authored migration`);
    const want = new Map(fb.tuples.map((t) => [keyOf(fb, t), t]));
    const changed = fb.tuples.filter((t) => s.rows.get(keyOf(fb, t)) !== t);
    const gone = [...s.rows.keys()].filter((k) => !want.has(k));
    if (gone.length) {
      if (fb.kind !== 'insert') throw new Error(`${baseFile}: rows left the ${fb.table} update block — not expressible as a delta`);
      const pk = base.pk[fb.table];
      dels.push(`delete from public.${fb.table} where (${pk.join(', ')}) in (\n${gone.map((k) => '  (' + k.split('|').join(', ') + ')').join(',\n')}\n);`);
      gone.forEach((k) => checks.push(`  if exists (select 1 from public.${fb.table} where (${pk.join(', ')}) = (${k.split('|').join(', ')})) then raise exception 'delta: ${fb.table} row ${k.replace(/'/g, '')} was not deleted'; end if;`));
    }
    if (changed.length) {
      if (fb.kind === 'update') {
        ups.push([...fb.header, changed.map((t) => '  ' + t).join(',\n'), ...fb.tail].join('\n'));
      } else {
        const tail = fb.tail.join('\n').includes('on conflict') ? fb.tail.join('\n') : (() => {
          const pk = base.pk[fb.table];
          if (!pk) throw new Error(`${baseFile}: ${fb.table} has no primary key to upsert on`);
          const rest = fb.cols.filter((c) => !pk.includes(c));
          return `on conflict (${pk.join(', ')}) do ${rest.length ? 'update set ' + rest.map((c) => `${c} = excluded.${c}`).join(', ') : 'nothing'};`;
        })();
        const single = !/ values$/.test(fb.header[0]);   // `insert … (cols)` + `  values (…)` form
        ups.push(single ? `${fb.header[0]}\n  values ${changed[0]}\n${tail}`
          : `${fb.header[0]}\n${changed.map((t) => '  ' + t).join(',\n')}\n${tail}`);
      }
      for (const t of changed) {
        const f = splitTuple(t);
        const pairs = fb.cols.map((c, i) => [c, f[i]]).filter(([, v]) => !/^\w+\(\)$/.test(v));
        const where = fb.kind === 'update' ? null : pairs.map(([c, v]) => `${c} is not distinct from ${v}`).join(' and ');
        if (where) checks.push(`  if not exists (select 1 from public.${fb.table} where ${where}) then raise exception 'delta: ${fb.table} row ${f[0].replace(/'/g, '')} did not land'; end if;`);
      }
    }
    if ((changed.length || gone.length) && owned.has(fb.table) && fb.kind === 'insert') {
      counts.push(`  select count(*) into v_n from public.${fb.table};\n  if v_n <> ${fb.tuples.length} then raise exception 'delta: ${fb.table} holds % rows, the catalogue has ${fb.tuples.length}', v_n; end if;`);
    }
  }
  if (!ups.length && !dels.length) return '';
  return [
    '-- ════════════════════════════════════════════════════════════════════════',
    `-- GENERATED DELTA of ${baseFile} — DO NOT EDIT BY HAND.`,
    '--',
    `-- ${baseFile} is applied history and FROZEN (tests/generated-frozen.json).`,
    '-- These are the rows the data in src/** now wants that differ from it (plus',
    '-- any deltas already applied on top), as idempotent upserts and keyed deletes.',
    '-- Written by tools/generated-freeze.mjs on behalf of the gen-* tool that owns',
    `-- the base; that tool's --check fails if this file is stale. Apply AFTER every`,
    '-- other migration (it is last in tests/schema-apply-order.json); once applied,',
    '-- the Coordinator pins it in tests/generated-frozen.json with deltaOf.',
    '-- ════════════════════════════════════════════════════════════════════════',
    '',
    ...dels, ...dels.length ? [''] : [],
    ...ups.map((u) => u + '\n'),
    '-- ── SELF-CHECK (executed): every row landed, every delete held, owned',
    '--    tables hold exactly the catalogue\'s row count. ─────────────────────',
    'do $$',
    'declare v_n bigint;',
    'begin',
    ...checks, ...counts,
    'end $$;',
    '',
  ].join('\n');
}

function ensureOrdered(file, baseFile) {
  const txt = readFileSync(ORDER, 'utf8');
  const j = JSON.parse(txt);
  if (j.order.includes(file)) return false;
  const last = j.order[j.order.length - 1];
  let out = txt.replace(`    "${last}"\n  ]`, `    "${last}",\n    "${file}"\n  ]`);
  if (out === txt) throw new Error('could not append ' + file + ' to schema-apply-order.json order');
  const notes = Object.keys(j._order_notes); const lastNote = notes[notes.length - 1];
  const note = `STAGED, NOT APPLIED - GENERATED DELTA of ${baseFile} (tools/generated-freeze.mjs). Row upserts only; apply LAST, after every other migration; then pin it in tests/generated-frozen.json (deltaOf).`;
  const lineStart = `    "${lastNote}": `;
  const idx = out.indexOf(lineStart); const eol = out.indexOf('\n', idx);
  out = out.slice(0, eol) + ',\n    "' + file + '": ' + JSON.stringify(note) + out.slice(eol);
  JSON.parse(out);
  writeFileSync(ORDER, out);
  return true;
}
function dropOrdered(file) {
  const txt = readFileSync(ORDER, 'utf8');
  const j = JSON.parse(txt);
  if (!j.order.includes(file)) return;
  delete j._order_notes[file];
  j.order = j.order.filter((f) => f !== file);
  // Only a delta this module wrote is ever dropped; rebuild just those two keys.
  let out = txt.replace(new RegExp(',\\n    "' + file.replace(/\./g, '\\.') + '"', ''), '');
  out = out.replace(new RegExp(',\\n    "' + file.replace(/\./g, '\\.') + '": "[^\\n]*"', ''), '');
  JSON.parse(out);
  writeFileSync(ORDER, out);
}

/**
 * The ONE write/check path for a generated migration.
 *   outPath  absolute path of the generated file the tool owns
 *   fullSql  what the tool would write if the file were not frozen
 *   check    true for `--check`
 * Returns { ok, msg }. A non-frozen file is written/compared exactly as before.
 */
export function emitGenerated(outPath, fullSql, check) {
  const reg = readRegistry();
  const file = basename(outPath);
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (!reg.files[file]) {
    if (check) {
      const have = existsSync(outPath) ? readFileSync(outPath, 'utf8') : null;
      if (have === null) return { ok: false, msg: `${file} is missing` };
      return norm(have) === norm(fullSql) ? { ok: true, msg: `${file} in sync` } : { ok: false, msg: `${file} is stale` };
    }
    writeFileSync(outPath, fullSql, 'utf8');
    return { ok: true, msg: `wrote ${file}` };
  }
  let delta;
  const fail = (msg) => { if (check) return { ok: false, msg }; throw new Error(msg); };   // a WRITE that cannot proceed must not exit 0
  try { delta = buildDelta(file, fullSql, reg); } catch (e) { return fail(e.message); }
  const open = openDeltaFiles(file, reg);
  if (open.length > 1) return fail(`${file}: more than one open delta (${open.join(', ')}) — merge them`);
  if (check) {
    if (!delta) return open.length ? { ok: false, msg: `${open[0]} is open but ${file} needs no delta — delete it (re-run the generator)` }
      : { ok: true, msg: `${file} frozen, no delta needed` };
    if (!open.length) return { ok: false, msg: `${file} is frozen and the data moved: run the generator to write its delta` };
    const have = readFileSync(join(MIG, open[0]), 'utf8');
    if (norm(have) !== norm(delta)) return { ok: false, msg: `${open[0]} is stale — re-run the generator` };
    const ord = JSON.parse(readFileSync(ORDER, 'utf8')).order;
    if (ord[ord.length - 1] !== open[0] && !ord.slice(ord.indexOf(open[0])).every((f) => /\.delta\.generated\.sql$/.test(f) || f === open[0]))
      return { ok: false, msg: `${open[0]} must be at the END of schema-apply-order.json order` };
    if (!ord.includes(open[0])) return { ok: false, msg: `${open[0]} is not in schema-apply-order.json order` };
    return { ok: true, msg: `${file} frozen + ${open[0]} in sync` };
  }
  if (!delta) {
    open.forEach((f) => { unlinkSync(join(MIG, f)); dropOrdered(f); });
    return { ok: true, msg: `${file} frozen, no delta needed` };
  }
  const name = open[0] || `${new Date().toISOString().slice(0, 10)}-${deltaStem(file)}.delta.generated.sql`;
  writeFileSync(join(MIG, name), delta, 'utf8');
  ensureOrdered(name, file);
  return { ok: true, msg: `${file} frozen; wrote ${name}` };
}
