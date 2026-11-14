// ════════════════════════════════════════════════════════════════════════
// tools/pack/ship.mjs — RENDER A PACK'S ADDITIVE FILE (lane/b-ground-pack phase 4).
//
// The whole catalogue generators are run in write mode with the pack folded in (HR_PACK_FOLD_ADD, tools/pack/whole.mjs), their
// files are read, and every file is put back byte for byte: the tree ends as it began. The pack's rows are what those renders
// add over the committed files (tools/pack/sql.mjs diffRows), which the whole --check proves are the renders without it.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './files.mjs';
import { rowsOf, diffRows, packSql, PACK_TABLES } from './sql.mjs';

/* the whole generators whose tables carry a ground's rows (measured: a fixture pack moves these four and no other generator) */
export const COVERED = Object.freeze(['gen-hunts.mjs', 'gen-hunt-sessions.mjs', 'gen-catalogues.mjs', 'gen-ground-tiers.mjs']);

const MIG = (root) => join(root, 'supabase', 'migrations');

/**
 * Run each covered generator, in write mode, with `fold` packs folded in; answers { before: Map(file -> text), after: Map } for
 * every migration that moved, after putting every one back. `check` runs --check instead (a dry pass: answers the statuses).
 */
export function renderFolded(fold, root = ROOT) {
  const dir = MIG(root);
  const snap = new Map(readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
  const after = new Map(), before = new Map();
  try {
    for (const g of COVERED) {
      const r = spawnSync(process.execPath, [join(root, 'tools', g)], { cwd: root, encoding: 'utf8', env: { ...process.env, HR_PACK_FOLD_ADD: fold.join(',') } });
      if (r.status !== 0) throw new Error('pack ship: ' + g + ' failed (' + r.status + '):\n' + (r.stderr || r.stdout).slice(-2000));
    }
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
      const now = readFileSync(join(dir, f), 'utf8');
      if (snap.get(f) !== now) { after.set(f, now); before.set(f, snap.has(f) ? snap.get(f) : ''); }
    }
  } finally {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql'))) {
      if (!snap.has(f)) rmSync(join(dir, f));
      else if (readFileSync(join(dir, f), 'utf8') !== snap.get(f)) writeFileSync(join(dir, f), snap.get(f));
    }
  }
  return { before, after };
}

/** Everything of a file a pack must not move: its schema and function bodies. Masked: its catalogue rows (the diff reads them),
    comments, its `do $$ ... $$` self-checks (they restate the rows they check), counts and digests. A plain `insert ... values ...;`
    into a table a pack may write (PACK_TABLES) is rows and nothing else, so the whole statement is masked: a generator writes a comment
    where a table has no row yet, and the FIRST row of such a table (Krell's Hold's hall in hr_boss_halls) is a row, not a new frame.
    An insert into any other table still reads as a move (and the diff refuses its rows). */
export function frameOf(text) {
  const packInsert = new RegExp('^insert into public\\.(' + Object.keys(PACK_TABLES).join('|') + ') \\([^)]*\\) values <rows>;$', 'gm');
  return text.replace(/\r\n/g, '\n')
    .replace(/^\s*--.*$/gm, '')
    .replace(/\bdo \$\$[\s\S]*?\$\$;/g, 'do <self-check>;')
    .replace(/(insert into public\.[a-z0-9_]+ \([^)]*\) values)[\s\S]*?(?=\n(on conflict|;)|;\n)/g, '$1 <rows>')
    .replace(packInsert, '')
    .replace(/\b[0-9a-f]{64}\b|\b[0-9a-f]{12,16}…?/g, '<digest>')
    .replace(/\b\d+\b/g, '<n>');
}

/**
 * A staged pack's pack.js text OPENED on `file` (a staged ground is never served, so its rows exist only once it is open). Throws when
 * the text has no `status: "staged",` and `sql: null,` lines as the tool writes them: a silent miss would ship a file with no rows.
 */
export function openedText(text, file) {
  const status = /^(\s*)status: "staged",$/m, sql = /^(\s*)sql: (null|"[^"]*"),$/m;
  if (!status.test(text) || !sql.test(text)) throw new Error('its pack.js has no `status: "staged",` and `sql: null,` lines to open (double quotes, as the tool writes them)');
  return text.replace(status, '$1status: "open",').replace(sql, '$1sql: "' + file + '",');
}

/**
 * A SHIP REHEARSAL: what `tools/pack.mjs ship <id>` would render for a staged pack, with the tree put back as it was. The pack is
 * opened in place on a file name no apply order holds, rendered, and restored. Answers shipText's { sql, added, moved, files }.
 */
export function rehearse(id, root = ROOT) {
  const packFile = join(root, 'src', 'data', 'grounds', id, 'pack.js');
  const before = readFileSync(packFile, 'utf8');
  writeFileSync(packFile, openedText(before, '2099-01-01-pack-' + id + '.generated.sql'));
  try { return shipText(id, root); } finally { writeFileSync(packFile, before); }
}

/**
 * A pack's additive file from one fold render: { sql, added, moved } where `moved` lists every file whose frame (its text with
 * rows, numbers and digests masked) changed, which a pack must not do (a new function body or a new statement is a world move).
 */
export function shipText(id, root = ROOT) {
  const { before, after } = renderFolded([id], root);
  const added = [], moved = [];
  for (const [f, now] of after) {
    for (const t of diffRows(rowsOf(before.get(f)), rowsOf(now))) added.push({ ...t, file: f });
    if (frameOf(before.get(f)) !== frameOf(now)) moved.push(f);
  }
  /* one block a table: a table two files write (none today) is merged in render order */
  const byTable = new Map();
  for (const t of added) { const e = byTable.get(t.table); if (e) e.rows.push(...t.rows); else byTable.set(t.table, { table: t.table, cols: t.cols, rows: [...t.rows] }); }
  /* parents first: the order PACK_TABLES lists them in (items before their slots, a hunt before its spawns, a ground before its tiers) */
  const rank = Object.keys(PACK_TABLES);
  const tables = [...byTable.values()].sort((a, b) => rank.indexOf(a.table) - rank.indexOf(b.table));
  return { sql: packSql(id, tables, COVERED), added: tables, moved, files: [...after.keys()] };
}
