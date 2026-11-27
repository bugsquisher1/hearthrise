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
import { foldedPacks } from './whole.mjs';
import { rowsOf, diffRows, packSql, PACK_TABLES } from './sql.mjs';

/* the whole generators whose tables carry a ground's rows (measured: a fixture pack moves the first three and no other generator; gen-factions
   moves only for a ground that pays a faction standing, its standingFor, lane/c-faction-standing; gen-ground-tiers left with the tier rows,
   lane/retire-tier-chain 2026-11-26). gen-flame-temper (item Levels, fuel) and gen-tally-tasks (her tier book) read the whole view too, so a
   pack shipped after their whole files is in neither unless its own file carries those rows (lane/flame-temper-shipped-packs, tests/ground-pack.mjs
   GP-9); each is named in a file's header only when it adds a row there (THEIRS below) */
export const COVERED = Object.freeze(['gen-hunts.mjs', 'gen-hunt-sessions.mjs', 'gen-catalogues.mjs', 'gen-factions.mjs', 'gen-flame-temper.mjs', 'gen-tally-tasks.mjs']);
/* the generators a pack's header names only when it adds rows to their tables, so a pack shipped before they joined COVERED renders
   byte-identical (tests/ground-pack.mjs GP-3) */
const THEIRS = Object.freeze({ 'gen-factions.mjs': ['hr_faction_grounds'], 'gen-flame-temper.mjs': ['hr_item_levels', 'hr_flame_fuel'], 'gen-tally-tasks.mjs': ['hr_tally_tiers'] });
/* the per-item generators renderFolded leaves out for a pack their whole file already folds (their rows are that file's) */
const CARRIED_WHEN_FOLDED = Object.freeze({ 'gen-flame-temper.mjs': true, 'gen-tally-tasks.mjs': true });

const MIG = (root) => join(root, 'supabase', 'migrations');

/**
 * Run each covered generator, in write mode, with `fold` packs folded in; answers { before: Map(file -> text), after: Map } for
 * every migration that moved, after putting every one back. `check` runs --check instead (a dry pass: answers the statuses).
 */
export function renderFolded(fold, root = ROOT) {
  const dir = MIG(root);
  const sqls = () => readdirSync(dir).filter((x) => x.endsWith('.sql'));
  const snap = new Map(sqls().map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
  const restore = () => {
    for (const f of sqls()) {
      if (!snap.has(f)) rmSync(join(dir, f));
      else if (readFileSync(join(dir, f), 'utf8') !== snap.get(f)) writeFileSync(join(dir, f), snap.get(f));
    }
  };
  /* a per-item generator whose whole file already folds every one of these packs carries their rows there (its --check holds them), so it is
     not rendered: its world without a pack it folds (the BEFORE render) is refused by its own validators (Krell's Hold holds the parts of two
     imbuements, gen-flame-temper's D-12), and there is nothing for the pack's file to add */
  const skip = new Set(Object.keys(CARRIED_WHEN_FOLDED).filter((g) => {
    const m = readFileSync(join(root, 'tools', g), 'utf8').match(/OUT_(?:NAME|FILE) = '([^']+)'/);
    if (!m) throw new Error('pack ship: no whole file name in tools/' + g);
    const folded = foldedPacks(m[1], root);
    return fold.every((id) => folded.includes(id));
  }));
  /* one render of every covered generator under `env`: each migration's text after it, the tree put back */
  const render = (env) => {
    try {
      for (const g of COVERED.filter((x) => !skip.has(x))) {
        const r = spawnSync(process.execPath, [join(root, 'tools', g)], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
        if (r.status !== 0) throw new Error('pack ship: ' + g + ' failed (' + r.status + '):\n' + (r.stderr || r.stdout).slice(-2000));
      }
      return new Map(sqls().map((f) => [f, readFileSync(join(dir, f), 'utf8')]));
    } finally { restore(); }
  };
  /* BEFORE: the whole files WITHOUT these packs (a whole file the apply order already folds one into renders without it: the
     training-gear catalogues carry the March packs), AFTER: with them. With no whole file folding them yet, BEFORE is the committed tree. */
  const without = render({ HR_PACK_FOLD_DROP: fold.join(',') });
  const withIt = render({ HR_PACK_FOLD_ADD: fold.join(',') });
  const after = new Map(), before = new Map();
  for (const f of new Set([...without.keys(), ...withIt.keys()])) {
    const b0 = without.has(f) ? without.get(f) : '', a0 = withIt.has(f) ? withIt.get(f) : '';
    if (b0 !== a0) { after.set(f, a0); before.set(f, b0); }
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
  /* either quote: the tool writes double, a hand-built pack (the Roost, the Catacombs) single (lane/flame-temper-shipped-packs) */
  const status = /^(\s*)status: (["'])staged\2,$/m, sql = /^(\s*)sql: (null|"[^"]*"|'[^']*'),$/m;
  if (!status.test(text) || !sql.test(text)) throw new Error('its pack.js has no `status: "staged",` and `sql: null,` lines to open');
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
  /* the header names the generators that carry THIS pack's rows: gen-factions only for a ground that pays a standing (an hr_faction_grounds
     row), so a pack shipped before gen-factions joined COVERED renders byte-identical (tests/ground-pack.mjs GP-3) */
  const sources = COVERED.filter((g) => !THEIRS[g] || tables.some((t) => THEIRS[g].includes(t.table)));
  return { sql: packSql(id, tables, sources), added: tables, moved, files: [...after.keys()] };
}
